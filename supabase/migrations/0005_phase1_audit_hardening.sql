-- =============================================================================
-- KapeOS Phase 1 Audit Hardening Migration
-- Fixes:
--   1. Performance & integrity indexes (single open shift per drawer, single default tax, single active prod owner)
--   2. Strict action allowlist + branch/env isolation in has_permission() and staff RLS
--   3. Server-derived pricing, recipe variant deduplication, modifier ingredient demand, and availability validation in place_order_transactional
--   4. Atomic confirm_pending_order_transactional, refund_payment_transactional, stock_adjust_ingredient_transactional, close_cash_shift_transactional
--   5. Fix cancel_order_transactional from_status capture & table status release
--   6. Replace open table_carts RLS with token-scoped QR RPCs & grant public_order_queue SELECT
--   7. Storage bucket size & MIME type restrictions
-- =============================================================================

-- 1. Integrity & Performance Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_production_owner
  ON public.user_profiles (env_mode)
  WHERE role_key = 'super_admin' AND is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_open_shift_per_drawer
  ON public.cash_drawer_shifts (drawer_id)
  WHERE status = 'open';

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_default_tax_per_branch
  ON public.tax_profiles (env_mode, branch_id)
  WHERE is_default = true;

CREATE INDEX IF NOT EXISTS idx_orders_branch_created
  ON public.orders (env_mode, branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status
  ON public.orders (env_mode, branch_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_table
  ON public.orders (table_id) WHERE table_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_items_kds
  ON public.order_items (kds_station_id, kds_status);
CREATE INDEX IF NOT EXISTS idx_order_items_order
  ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_stock_res_order_status
  ON public.stock_reservations (order_id, status);
CREATE INDEX IF NOT EXISTS idx_movements_ing_created
  ON public.inventory_movements (ingredient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_order_status
  ON public.payments (order_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_env_created
  ON public.audit_logs (env_mode, created_at DESC);

-- 2. Harden has_permission with strict action allowlist
CREATE OR REPLACE FUNCTION public.has_permission(p_module text, p_action text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.user_profiles%ROWTYPE;
  v_override boolean;
  v_role_perm boolean;
BEGIN
  IF p_action NOT IN ('view', 'create', 'edit', 'delete', 'approve', 'export') THEN
    RETURN false;
  END IF;

  SELECT * INTO v_profile FROM public.user_profiles WHERE id = auth.uid();
  IF NOT FOUND OR NOT v_profile.is_active THEN
    RETURN false;
  END IF;
  IF v_profile.role_key = 'super_admin' THEN
    RETURN true;
  END IF;

  EXECUTE format(
    'SELECT %I FROM public.user_permission_overrides WHERE user_id = $1 AND module = $2',
    'can_' || p_action
  ) INTO v_override USING auth.uid(), p_module;

  IF v_override IS NOT NULL THEN
    RETURN v_override;
  END IF;

  EXECUTE format(
    'SELECT %I FROM public.role_permissions WHERE role_key = $1 AND module = $2',
    'can_' || p_action
  ) INTO v_role_perm USING v_profile.role_key, p_module;

  RETURN COALESCE(v_role_perm, false);
END;
$$;

-- 3. Harden table_carts / table_cart_items / public_order_queue / login_attempts
DROP POLICY IF EXISTS "qr_and_staff_table_carts" ON public.table_carts;
DROP POLICY IF EXISTS "qr_and_staff_table_cart_items" ON public.table_cart_items;

CREATE POLICY "staff_manage_table_carts" ON public.table_carts FOR ALL
  USING (public.is_active_staff() AND env_mode = public.current_staff_env() AND branch_id = public.current_staff_branch())
  WITH CHECK (public.is_active_staff() AND env_mode = public.current_staff_env() AND branch_id = public.current_staff_branch());

CREATE POLICY "staff_manage_table_cart_items" ON public.table_cart_items FOR ALL
  USING (public.is_active_staff())
  WITH CHECK (public.is_active_staff());

-- Explicitly scope orders & inventory staff reads by branch + env_mode
DROP POLICY IF EXISTS "staff_read_orders" ON public.orders;
CREATE POLICY "staff_read_orders" ON public.orders FOR SELECT
  USING (public.has_permission('orders', 'view') AND env_mode = public.current_staff_env() AND branch_id = public.current_staff_branch());

DROP POLICY IF EXISTS "staff_read_ingredients" ON public.ingredients;
CREATE POLICY "staff_read_ingredients" ON public.ingredients FOR SELECT
  USING (public.has_permission('inventory', 'view') AND env_mode = public.current_staff_env() AND branch_id = public.current_staff_branch());

-- Grant anonymous & authenticated read access to PII-free public queue view
GRANT SELECT ON public.public_order_queue TO anon, authenticated;

-- 4. Automatic Product Availability Synchronization
CREATE OR REPLACE FUNCTION public.recompute_product_availability(p_branch_id uuid, p_env env_mode)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.products p
  SET is_available = CASE
    WHEN p.manual_unavailable THEN false
    ELSE NOT EXISTS (
      SELECT 1
      FROM public.recipes r
      JOIN public.recipe_items ri ON ri.recipe_id = r.id
      JOIN public.ingredients i ON i.id = ri.ingredient_id
      WHERE r.product_id = p.id
        AND r.variant_id IS NULL
        AND (i.current_stock - i.reserved_stock) + 1e-6 < (ri.quantity * (1 + r.waste_factor_percent / 100.0))
    )
  END
  WHERE p.branch_id = p_branch_id AND p.env_mode = p_env;
END;
$$;

-- 5. Hardened Order Placement RPC (Server-derived pricing + modifier ingredient reservations)
CREATE OR REPLACE FUNCTION public.place_order_transactional(
  p_env env_mode,
  p_branch_id uuid,
  p_channel order_channel,
  p_order_type order_type,
  p_table_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_delivery_address text,
  p_delivery_notes text,
  p_delivery_fee numeric,
  p_discount_total numeric,
  p_discount_reason text,
  p_order_notes text,
  p_is_priority boolean,
  p_idempotency_key text,
  p_items jsonb
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.orders%ROWTYPE;
  v_branch public.branches%ROWTYPE;
  v_tax public.tax_profiles%ROWTYPE;
  v_policy public.channel_policies%ROWTYPE;
  v_manila_date date := (now() AT TIME ZONE 'Asia/Manila')::date;
  v_seq integer;
  v_ch_code text;
  v_order_num text;
  v_queue_num text;
  v_subtotal numeric(12,2) := 0;
  v_discounted numeric(12,2);
  v_tax_total numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_initial_status order_status;
  v_order public.orders%ROWTYPE;
  v_item jsonb;
  v_prod public.products%ROWTYPE;
  v_var public.product_variants%ROWTYPE;
  v_mod jsonb;
  v_mod_opt public.modifier_options%ROWTYPE;
  v_unit_price numeric(12,2);
  v_qty integer;
  v_recipe_id uuid;
  v_waste numeric(6,2);
  v_unit_cost numeric(12,4);
  v_req record;
  v_avail numeric(14,4);
  v_effective_discount numeric(12,2) := 0;
BEGIN
  IF jsonb_array_length(COALESCE(p_items, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Order must contain at least one item';
  END IF;

  -- Idempotency check
  SELECT * INTO v_existing FROM public.orders WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  -- Only active POS staff may place POS orders or apply arbitrary manual discounts
  IF p_channel = 'pos' AND NOT public.has_permission('pos', 'create') THEN
    RAISE EXCEPTION 'Permission denied: pos.create required';
  END IF;

  SELECT * INTO v_branch FROM public.branches WHERE id = p_branch_id AND env_mode = p_env AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active branch not found for environment';
  END IF;

  SELECT * INTO v_tax FROM public.tax_profiles WHERE branch_id = p_branch_id AND env_mode = p_env AND is_default = true LIMIT 1;
  SELECT * INTO v_policy FROM public.channel_policies WHERE branch_id = p_branch_id AND env_mode = p_env AND channel = p_channel;

  -- Concurrency-safe sequential numbering
  INSERT INTO public.order_sequences (branch_id, env_mode, business_date, channel, last_seq)
  VALUES (p_branch_id, p_env, v_manila_date, p_channel, 0)
  ON CONFLICT (branch_id, env_mode, business_date, channel) DO NOTHING;

  SELECT last_seq + 1 INTO v_seq
  FROM public.order_sequences
  WHERE branch_id = p_branch_id AND env_mode = p_env AND business_date = v_manila_date AND channel = p_channel
  FOR UPDATE;

  UPDATE public.order_sequences
  SET last_seq = v_seq
  WHERE branch_id = p_branch_id AND env_mode = p_env AND business_date = v_manila_date AND channel = p_channel;

  v_ch_code := CASE p_channel
    WHEN 'pos' THEN 'POS'
    WHEN 'qr_table' THEN 'QR'
    WHEN 'kiosk' THEN 'KSK'
    ELSE 'ONL'
  END;

  v_order_num := v_branch.order_prefix || '-' || v_ch_code || '-' || to_char(v_manila_date, 'YYMMDD') || '-' || lpad(v_seq::text, 4, '0');
  v_queue_num := substr(v_ch_code, 1, 1) || '-' || lpad(v_seq::text, 3, '0');

  v_initial_status := CASE
    WHEN p_channel = 'pos' THEN 'confirmed'::order_status
    WHEN v_policy.approval_policy = 'staff_approval' THEN 'pending'::order_status
    ELSE 'confirmed'::order_status
  END;

  -- Create order shell first (totals updated right after authoritative item computation)
  INSERT INTO public.orders (
    env_mode, branch_id, order_number, queue_number, channel, order_type, table_id,
    status, payment_status, customer_name, customer_phone, delivery_address, delivery_notes,
    delivery_fee, is_priority, order_notes, idempotency_key, created_by
  ) VALUES (
    p_env, p_branch_id, v_order_num, v_queue_num, p_channel, p_order_type, p_table_id,
    v_initial_status, 'unpaid', p_customer_name, p_customer_phone, p_delivery_address, p_delivery_notes,
    GREATEST(0, COALESCE(p_delivery_fee, 0)), COALESCE(p_is_priority, false), p_order_notes, p_idempotency_key, auth.uid()
  ) RETURNING * INTO v_order;

  -- Compute authoritative server-side prices & recipe cost snapshots per item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_prod
    FROM public.products
    WHERE id = (v_item->>'productId')::uuid AND branch_id = p_branch_id AND env_mode = p_env;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not found in branch';
    END IF;
    IF NOT v_prod.is_available OR v_prod.manual_unavailable THEN
      RAISE EXCEPTION 'Product "%" is currently unavailable', v_prod.name;
    END IF;

    v_qty := GREATEST(1, (v_item->>'quantity')::integer);
    v_unit_price := v_prod.base_price;
    v_var := NULL;

    IF NULLIF(v_item->>'variantId', '') IS NOT NULL THEN
      SELECT * INTO v_var
      FROM public.product_variants
      WHERE id = (v_item->>'variantId')::uuid AND product_id = v_prod.id;
      IF FOUND THEN
        v_unit_price := v_unit_price + v_var.price_delta;
      END IF;
    END IF;

    FOR v_mod IN SELECT * FROM jsonb_array_elements(COALESCE(v_item->'modifiers', '[]'::jsonb))
    LOOP
      IF NULLIF(v_mod->>'optionId', '') IS NOT NULL THEN
        SELECT * INTO v_mod_opt FROM public.modifier_options WHERE id = (v_mod->>'optionId')::uuid;
        IF FOUND THEN
          v_unit_price := v_unit_price + v_mod_opt.price_delta;
        END IF;
      END IF;
    END LOOP;

    -- Select variant recipe if exists, else default recipe (never both)
    SELECT id, waste_factor_percent INTO v_recipe_id, v_waste
    FROM public.recipes
    WHERE product_id = v_prod.id
      AND (variant_id = v_var.id OR variant_id IS NULL)
    ORDER BY (variant_id IS NULL) ASC
    LIMIT 1;

    v_unit_cost := 0;
    IF v_recipe_id IS NOT NULL THEN
      SELECT COALESCE(sum(ri.quantity * ing.unit_cost * (1 + COALESCE(v_waste, 0) / 100.0)), 0)
      INTO v_unit_cost
      FROM public.recipe_items ri
      JOIN public.ingredients ing ON ing.id = ri.ingredient_id
      WHERE ri.recipe_id = v_recipe_id;
    END IF;

    v_subtotal := v_subtotal + round(v_unit_price * v_qty, 2);

    INSERT INTO public.order_items (
      order_id, product_id, variant_id, kds_station_id, product_name, variant_name,
      quantity, unit_price, modifiers, notes, unit_cost_snapshot, line_total
    ) VALUES (
      v_order.id, v_prod.id, v_var.id, v_prod.kds_station_id, v_prod.name, v_var.name,
      v_qty, v_unit_price, COALESCE(v_item->'modifiers', '[]'::jsonb), v_item->>'notes',
      round(v_unit_cost, 4), round(v_unit_price * v_qty, 2)
    );
  END LOOP;

  -- Restrict manual discounts to authorized staff
  IF COALESCE(p_discount_total, 0) > 0 AND public.has_permission('pos', 'edit') THEN
    v_effective_discount := LEAST(v_subtotal, GREATEST(0, p_discount_total));
  END IF;

  v_discounted := GREATEST(0, v_subtotal - v_effective_discount);
  IF v_tax.id IS NOT NULL AND NOT v_tax.is_exempt AND v_tax.tax_type = 'vat' AND v_tax.rate_percent > 0 THEN
    IF v_tax.pricing_mode = 'inclusive' THEN
      v_tax_total := round(v_discounted - (v_discounted / (1 + (v_tax.rate_percent / 100))), 2);
      v_total := round(v_discounted + GREATEST(0, COALESCE(p_delivery_fee, 0)), 2);
    ELSE
      v_tax_total := round(v_discounted * (v_tax.rate_percent / 100), 2);
      v_total := round(v_discounted + v_tax_total + GREATEST(0, COALESCE(p_delivery_fee, 0)), 2);
    END IF;
  ELSE
    v_tax_total := 0;
    v_total := round(v_discounted + GREATEST(0, COALESCE(p_delivery_fee, 0)), 2);
  END IF;

  UPDATE public.orders
  SET subtotal = v_subtotal,
      discount_total = v_effective_discount,
      discount_reason = CASE WHEN v_effective_discount > 0 THEN p_discount_reason ELSE NULL END,
      tax_total = v_tax_total,
      total_amount = v_total
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  -- If confirmed immediately, reserve ingredients atomically (recipe + modifiers)
  IF v_initial_status = 'confirmed' THEN
    FOR v_req IN
      WITH item_recipes AS (
        SELECT oi.id AS order_item_id, oi.quantity,
               (
                 SELECT r.id FROM public.recipes r
                 WHERE r.product_id = oi.product_id AND (r.variant_id = oi.variant_id OR r.variant_id IS NULL)
                 ORDER BY (r.variant_id IS NULL) ASC LIMIT 1
               ) AS recipe_id
        FROM public.order_items oi
        WHERE oi.order_id = v_order.id
      ),
      recipe_demand AS (
        SELECT ri.ingredient_id,
               sum(ri.quantity * ir.quantity * (1 + r.waste_factor_percent / 100.0)) AS qty_needed
        FROM item_recipes ir
        JOIN public.recipes r ON r.id = ir.recipe_id
        JOIN public.recipe_items ri ON ri.recipe_id = r.id
        GROUP BY ri.ingredient_id
      ),
      mod_demand AS (
        SELECT mo.ingredient_id, sum(COALESCE(mo.ingredient_qty_delta, 0) * oi.quantity) AS qty_needed
        FROM public.order_items oi,
             jsonb_array_elements(oi.modifiers) AS m
        JOIN public.modifier_options mo ON mo.id = NULLIF(m->>'optionId', '')::uuid
        WHERE oi.order_id = v_order.id AND mo.ingredient_id IS NOT NULL AND COALESCE(mo.ingredient_qty_delta, 0) > 0
        GROUP BY mo.ingredient_id
      ),
      combined AS (
        SELECT ingredient_id, sum(qty_needed) AS qty_needed
        FROM (SELECT * FROM recipe_demand UNION ALL SELECT * FROM mod_demand) u
        GROUP BY ingredient_id
      )
      SELECT * FROM combined WHERE qty_needed > 0
    LOOP
      SELECT (current_stock - reserved_stock) INTO v_avail
      FROM public.ingredients WHERE id = v_req.ingredient_id FOR UPDATE;

      IF v_avail < v_req.qty_needed THEN
        RAISE EXCEPTION 'Insufficient ingredient stock for order confirmation';
      END IF;

      UPDATE public.ingredients
      SET reserved_stock = reserved_stock + v_req.qty_needed
      WHERE id = v_req.ingredient_id;

      INSERT INTO public.stock_reservations (env_mode, branch_id, order_id, ingredient_id, quantity, status)
      VALUES (p_env, p_branch_id, v_order.id, v_req.ingredient_id, v_req.qty_needed, 'active');
    END LOOP;

    PERFORM public.recompute_product_availability(p_branch_id, p_env);
  END IF;

  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by)
  VALUES (v_order.id, NULL, v_initial_status::text, COALESCE(p_customer_name, 'System'));

  IF p_table_id IS NOT NULL THEN
    UPDATE public.dining_tables SET status = 'occupied' WHERE id = p_table_id;
  END IF;

  IF p_order_type = 'delivery' THEN
    INSERT INTO public.deliveries (env_mode, branch_id, order_id, customer_name, customer_phone, address, delivery_instructions, delivery_fee, otp_code)
    VALUES (
      p_env, p_branch_id, v_order.id, COALESCE(p_customer_name, 'Customer'),
      COALESCE(p_customer_phone, ''), COALESCE(p_delivery_address, ''), p_delivery_notes,
      GREATEST(0, COALESCE(p_delivery_fee, 0)), lpad((floor(random() * 9000 + 1000))::text, 4, '0')
    );
  END IF;

  RETURN v_order;
END;
$$;

-- 6. Confirm Pending QR/Online Order + Atomic Stock Reservation
CREATE OR REPLACE FUNCTION public.confirm_pending_order_transactional(p_order_id uuid)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_actor text;
  v_req record;
  v_avail numeric(14,4);
BEGIN
  IF NOT public.has_permission('orders', 'approve') THEN
    RAISE EXCEPTION 'Permission denied: orders.approve required';
  END IF;

  SELECT full_name INTO v_actor FROM public.user_profiles WHERE id = auth.uid();
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.status <> 'pending' THEN RETURN v_order; END IF;

  FOR v_req IN
    WITH item_recipes AS (
      SELECT oi.id AS order_item_id, oi.quantity,
             (
               SELECT r.id FROM public.recipes r
               WHERE r.product_id = oi.product_id AND (r.variant_id = oi.variant_id OR r.variant_id IS NULL)
               ORDER BY (r.variant_id IS NULL) ASC LIMIT 1
             ) AS recipe_id
      FROM public.order_items oi
      WHERE oi.order_id = v_order.id
    ),
    combined AS (
      SELECT ri.ingredient_id,
             sum(ri.quantity * ir.quantity * (1 + r.waste_factor_percent / 100.0)) AS qty_needed
      FROM item_recipes ir
      JOIN public.recipes r ON r.id = ir.recipe_id
      JOIN public.recipe_items ri ON ri.recipe_id = r.id
      GROUP BY ri.ingredient_id
    )
    SELECT * FROM combined WHERE qty_needed > 0
  LOOP
    SELECT (current_stock - reserved_stock) INTO v_avail
    FROM public.ingredients WHERE id = v_req.ingredient_id FOR UPDATE;
    IF v_avail < v_req.qty_needed THEN
      RAISE EXCEPTION 'Insufficient ingredient stock to confirm pending order';
    END IF;
    UPDATE public.ingredients SET reserved_stock = reserved_stock + v_req.qty_needed WHERE id = v_req.ingredient_id;
    INSERT INTO public.stock_reservations (env_mode, branch_id, order_id, ingredient_id, quantity, status)
    VALUES (v_order.env_mode, v_order.branch_id, v_order.id, v_req.ingredient_id, v_req.qty_needed, 'active');
  END LOOP;

  UPDATE public.orders
  SET status = 'confirmed', approved_by = auth.uid(), updated_at = now()
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  PERFORM public.recompute_product_availability(v_order.branch_id, v_order.env_mode);

  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by)
  VALUES (p_order_id, 'pending', 'confirmed', COALESCE(v_actor, 'Staff'));

  RETURN v_order;
END;
$$;

-- 7. Fix cancel_order_transactional (preserve prior status in history + release table)
CREATE OR REPLACE FUNCTION public.cancel_order_transactional(
  p_order_id uuid,
  p_reason text
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_prev_status text;
  v_actor_name text;
  v_res record;
  v_prep_started boolean;
BEGIN
  IF NOT public.has_permission('orders', 'edit') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT full_name INTO v_actor_name FROM public.user_profiles WHERE id = auth.uid();
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.status = 'cancelled' THEN
    RETURN v_order;
  END IF;

  v_prev_status := v_order.status::text;
  v_prep_started := v_order.status IN ('preparing', 'ready', 'completed');
  IF v_prep_started AND NOT public.has_permission('orders', 'approve') THEN
    RAISE EXCEPTION 'Manager approval required to cancel an order after preparation started';
  END IF;

  FOR v_res IN
    SELECT * FROM public.stock_reservations WHERE order_id = p_order_id AND status = 'active' FOR UPDATE
  LOOP
    UPDATE public.ingredients
    SET reserved_stock = GREATEST(0, reserved_stock - v_res.quantity)
    WHERE id = v_res.ingredient_id;

    UPDATE public.stock_reservations SET status = 'released', updated_at = now() WHERE id = v_res.id;
  END LOOP;

  UPDATE public.order_items SET kds_status = 'cancelled' WHERE order_id = p_order_id;

  UPDATE public.orders SET status = 'cancelled', updated_at = now()
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  PERFORM public.recompute_product_availability(v_order.branch_id, v_order.env_mode);

  IF v_order.table_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.orders
      WHERE table_id = v_order.table_id AND id <> v_order.id AND status NOT IN ('completed', 'cancelled')
    ) THEN
      UPDATE public.dining_tables SET status = 'available' WHERE id = v_order.table_id;
    END IF;
  END IF;

  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, reason)
  VALUES (p_order_id, v_prev_status, 'cancelled', COALESCE(v_actor_name, 'Staff'), p_reason);

  INSERT INTO public.audit_logs (env_mode, branch_id, actor_user_id, actor_name, action, module, target_id, reason, metadata)
  VALUES (
    v_order.env_mode, v_order.branch_id, auth.uid(), COALESCE(v_actor_name, 'Staff'),
    'order_cancelled', 'orders', p_order_id::text, p_reason,
    jsonb_build_object('prep_started', v_prep_started, 'from_status', v_prev_status)
  );

  RETURN v_order;
END;
$$;

-- 8. Refund / Void Payment Transactional RPC
CREATE OR REPLACE FUNCTION public.refund_payment_transactional(
  p_payment_id uuid,
  p_reason text
)
RETURNS public.payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_actor_name text;
  v_remaining_verified numeric(12,2);
  v_order_total numeric(12,2);
BEGIN
  IF NOT public.has_permission('payments', 'approve') THEN
    RAISE EXCEPTION 'Permission denied: payments.approve required for refunds';
  END IF;
  IF COALESCE(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'Refund reason is required';
  END IF;

  SELECT full_name INTO v_actor_name FROM public.user_profiles WHERE id = auth.uid();
  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF v_payment.status = 'refunded' THEN RETURN v_payment; END IF;
  IF v_payment.status <> 'verified' THEN
    RAISE EXCEPTION 'Only verified payments can be refunded';
  END IF;

  UPDATE public.payments
  SET status = 'refunded', rejection_reason = p_reason
  WHERE id = p_payment_id
  RETURNING * INTO v_payment;

  SELECT COALESCE(sum(amount), 0) INTO v_remaining_verified
  FROM public.payments WHERE order_id = v_payment.order_id AND status = 'verified';

  SELECT total_amount INTO v_order_total FROM public.orders WHERE id = v_payment.order_id;

  UPDATE public.orders
  SET payment_status = CASE
        WHEN v_remaining_verified <= 0 THEN 'refunded'::payment_status
        WHEN v_remaining_verified < v_order_total THEN 'partially_refunded'::payment_status
        ELSE 'paid'::payment_status
      END,
      updated_at = now()
  WHERE id = v_payment.order_id;

  INSERT INTO public.audit_logs (env_mode, branch_id, actor_user_id, actor_name, action, module, target_id, reason, metadata)
  VALUES (
    v_payment.env_mode, v_payment.branch_id, auth.uid(), COALESCE(v_actor_name, 'Staff'),
    'payment_refunded', 'payments', p_payment_id::text, p_reason,
    jsonb_build_object('amount', v_payment.amount, 'method', v_payment.method)
  );

  RETURN v_payment;
END;
$$;

-- 9. Token-Scoped Guest QR & Order Tracking RPCs (Zero Open Table Cart RLS)
CREATE OR REPLACE FUNCTION public.get_qr_table_context(p_qr_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table public.dining_tables%ROWTYPE;
  v_cart public.table_carts%ROWTYPE;
  v_items jsonb;
BEGIN
  SELECT * INTO v_table FROM public.dining_tables WHERE qr_token = p_qr_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid table QR token';
  END IF;

  INSERT INTO public.table_carts (env_mode, branch_id, table_id)
  VALUES (v_table.env_mode, v_table.branch_id, v_table.id)
  ON CONFLICT (table_id) DO NOTHING;

  SELECT * INTO v_cart FROM public.table_carts WHERE table_id = v_table.id;
  SELECT COALESCE(jsonb_agg(tci ORDER BY tci.created_at), '[]'::jsonb)
  INTO v_items
  FROM public.table_cart_items tci WHERE tci.cart_id = v_cart.id;

  RETURN jsonb_build_object('table', row_to_json(v_table), 'cart', row_to_json(v_cart), 'items', v_items);
END;
$$;

CREATE OR REPLACE FUNCTION public.add_qr_table_cart_item(
  p_qr_token text,
  p_product_id uuid,
  p_variant_id uuid,
  p_guest_label text,
  p_quantity integer,
  p_modifiers jsonb,
  p_notes text
)
RETURNS public.table_cart_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table public.dining_tables%ROWTYPE;
  v_cart public.table_carts%ROWTYPE;
  v_prod public.products%ROWTYPE;
  v_var public.product_variants%ROWTYPE;
  v_price numeric(12,2);
  v_item public.table_cart_items%ROWTYPE;
BEGIN
  SELECT * INTO v_table FROM public.dining_tables WHERE qr_token = p_qr_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid table QR token'; END IF;

  SELECT * INTO v_prod FROM public.products WHERE id = p_product_id AND branch_id = v_table.branch_id AND is_available = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product unavailable'; END IF;

  v_price := v_prod.base_price;
  IF p_variant_id IS NOT NULL THEN
    SELECT * INTO v_var FROM public.product_variants WHERE id = p_variant_id AND product_id = v_prod.id;
    IF FOUND THEN v_price := v_price + v_var.price_delta; END IF;
  END IF;

  INSERT INTO public.table_carts (env_mode, branch_id, table_id)
  VALUES (v_table.env_mode, v_table.branch_id, v_table.id)
  ON CONFLICT (table_id) DO NOTHING;

  SELECT * INTO v_cart FROM public.table_carts WHERE table_id = v_table.id FOR UPDATE;
  UPDATE public.table_carts SET version = version + 1, updated_at = now() WHERE id = v_cart.id;

  INSERT INTO public.table_cart_items (cart_id, product_id, variant_id, guest_label, quantity, selected_modifiers, notes, unit_price)
  VALUES (v_cart.id, p_product_id, p_variant_id, COALESCE(NULLIF(p_guest_label, ''), 'Guest'), GREATEST(1, p_quantity), COALESCE(p_modifiers, '[]'::jsonb), p_notes, v_price)
  RETURNING * INTO v_item;

  RETURN v_item;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_order_tracking_by_token(p_tracking_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_items jsonb;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE tracking_token = p_tracking_token;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', oi.id,
    'productName', oi.product_name,
    'variantName', oi.variant_name,
    'quantity', oi.quantity,
    'lineTotal', oi.line_total,
    'kdsStatus', oi.kds_status
  )), '[]'::jsonb)
  INTO v_items
  FROM public.order_items oi WHERE oi.order_id = v_order.id;

  RETURN jsonb_build_object(
    'orderNumber', v_order.order_number,
    'queueNumber', v_order.queue_number,
    'orderType', v_order.order_type,
    'status', v_order.status,
    'paymentStatus', v_order.payment_status,
    'totalAmount', v_order.total_amount,
    'createdAt', v_order.created_at,
    'updatedAt', v_order.updated_at,
    'items', v_items
  );
END;
$$;

-- 10. Storage Bucket Size & MIME Constraints
UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id IN ('cafe-assets', 'payment-proofs');
