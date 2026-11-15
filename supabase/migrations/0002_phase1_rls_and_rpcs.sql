-- =============================================================================
-- KapeOS Phase 1 Row Level Security (RLS) & Transactional RPC Functions
-- =============================================================================

-- Helper Functions (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.is_active_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.current_staff_branch()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT branch_id FROM public.user_profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_staff_env()
RETURNS env_mode
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT env_mode FROM public.user_profiles WHERE id = auth.uid() LIMIT 1;
$$;

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

CREATE OR REPLACE FUNCTION public.is_owner_exists(p_env env_mode DEFAULT 'production')
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE env_mode = p_env AND role_key = 'super_admin' AND is_active = true
  );
$$;

-- Enable RLS on ALL tables
ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kds_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modifier_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dining_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dining_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_drawers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_drawer_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_drawer_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.printer_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.in_app_notifications ENABLE ROW LEVEL SECURITY;

-- Public Read Policies (Strictly non-sensitive storefront & menu catalog)
CREATE POLICY "public_read_business_settings" ON public.business_settings FOR SELECT USING (true);
CREATE POLICY "public_read_active_branches" ON public.branches FOR SELECT USING (is_active = true);
CREATE POLICY "public_read_branch_hours" ON public.branch_hours FOR SELECT USING (true);
CREATE POLICY "public_read_categories" ON public.menu_categories FOR SELECT USING (is_active = true);
CREATE POLICY "public_read_products" ON public.products FOR SELECT USING (true);
CREATE POLICY "public_read_variants" ON public.product_variants FOR SELECT USING (true);
CREATE POLICY "public_read_modifier_groups" ON public.modifier_groups FOR SELECT USING (true);
CREATE POLICY "public_read_modifier_options" ON public.modifier_options FOR SELECT USING (true);
CREATE POLICY "public_read_product_modifiers" ON public.product_modifier_groups FOR SELECT USING (true);

-- Staff Read & Manage Policies (Enforced via has_permission + env_mode isolation)
CREATE POLICY "staff_manage_settings" ON public.business_settings FOR ALL
  USING (public.has_permission('settings', 'edit'))
  WITH CHECK (public.has_permission('settings', 'edit'));

CREATE POLICY "staff_read_tax_profiles" ON public.tax_profiles FOR SELECT USING (public.is_active_staff());
CREATE POLICY "staff_edit_tax_profiles" ON public.tax_profiles FOR ALL
  USING (public.has_permission('settings', 'edit'))
  WITH CHECK (public.has_permission('settings', 'edit'));

CREATE POLICY "staff_read_channel_policies" ON public.channel_policies FOR SELECT USING (true);
CREATE POLICY "staff_edit_channel_policies" ON public.channel_policies FOR ALL
  USING (public.has_permission('settings', 'edit'))
  WITH CHECK (public.has_permission('settings', 'edit'));

CREATE POLICY "staff_read_role_permissions" ON public.role_permissions FOR SELECT USING (public.is_active_staff());
CREATE POLICY "staff_read_own_or_admin_profiles" ON public.user_profiles FOR SELECT
  USING (id = auth.uid() OR public.has_permission('staff', 'view'));
CREATE POLICY "admin_manage_profiles" ON public.user_profiles FOR UPDATE
  USING (public.has_permission('staff', 'edit'))
  WITH CHECK (public.has_permission('staff', 'edit'));

CREATE POLICY "staff_read_own_overrides" ON public.user_permission_overrides FOR SELECT
  USING (user_id = auth.uid() OR public.has_permission('staff', 'view'));
CREATE POLICY "admin_manage_overrides" ON public.user_permission_overrides FOR ALL
  USING (public.has_permission('staff', 'edit'))
  WITH CHECK (public.has_permission('staff', 'edit'));

CREATE POLICY "staff_manage_invitations" ON public.staff_invitations FOR ALL
  USING (public.has_permission('staff', 'create'))
  WITH CHECK (public.has_permission('staff', 'create'));

CREATE POLICY "own_dashboard_layout" ON public.dashboard_layouts FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "own_sessions" ON public.user_sessions FOR ALL
  USING (user_id = auth.uid() OR public.has_permission('staff', 'view'))
  WITH CHECK (user_id = auth.uid() OR public.has_permission('staff', 'edit'));

CREATE POLICY "audit_read" ON public.audit_logs FOR SELECT USING (public.has_permission('audit', 'view'));
CREATE POLICY "audit_insert_staff" ON public.audit_logs FOR INSERT WITH CHECK (public.is_active_staff());

-- Menu & KDS Stations
CREATE POLICY "staff_read_kds_stations" ON public.kds_stations FOR SELECT USING (public.is_active_staff());
CREATE POLICY "staff_manage_kds_stations" ON public.kds_stations FOR ALL
  USING (public.has_permission('settings', 'edit')) WITH CHECK (public.has_permission('settings', 'edit'));

CREATE POLICY "staff_manage_categories" ON public.menu_categories FOR ALL
  USING (public.has_permission('menu', 'edit')) WITH CHECK (public.has_permission('menu', 'edit'));
CREATE POLICY "staff_manage_products" ON public.products FOR ALL
  USING (public.has_permission('menu', 'edit')) WITH CHECK (public.has_permission('menu', 'edit'));
CREATE POLICY "staff_manage_variants" ON public.product_variants FOR ALL
  USING (public.has_permission('menu', 'edit')) WITH CHECK (public.has_permission('menu', 'edit'));

-- Inventory & Recipes
CREATE POLICY "staff_read_ingredients" ON public.ingredients FOR SELECT USING (public.has_permission('inventory', 'view'));
CREATE POLICY "staff_manage_ingredients" ON public.ingredients FOR ALL
  USING (public.has_permission('inventory', 'edit')) WITH CHECK (public.has_permission('inventory', 'edit'));

CREATE POLICY "staff_read_recipes" ON public.recipes FOR SELECT USING (public.has_permission('recipes', 'view'));
CREATE POLICY "staff_manage_recipes" ON public.recipes FOR ALL
  USING (public.has_permission('recipes', 'edit')) WITH CHECK (public.has_permission('recipes', 'edit'));
CREATE POLICY "staff_read_recipe_items" ON public.recipe_items FOR SELECT USING (public.has_permission('recipes', 'view'));
CREATE POLICY "staff_manage_recipe_items" ON public.recipe_items FOR ALL
  USING (public.has_permission('recipes', 'edit')) WITH CHECK (public.has_permission('recipes', 'edit'));

CREATE POLICY "staff_read_movements" ON public.inventory_movements FOR SELECT USING (public.has_permission('inventory', 'view'));
CREATE POLICY "staff_insert_movements" ON public.inventory_movements FOR INSERT WITH CHECK (public.has_permission('inventory', 'create'));

-- Tables & QR Carts
CREATE POLICY "read_zones_tables" ON public.dining_zones FOR SELECT USING (true);
CREATE POLICY "manage_zones" ON public.dining_zones FOR ALL
  USING (public.has_permission('tables', 'edit')) WITH CHECK (public.has_permission('tables', 'edit'));
CREATE POLICY "read_tables" ON public.dining_tables FOR SELECT USING (true);
CREATE POLICY "manage_tables" ON public.dining_tables FOR ALL
  USING (public.has_permission('tables', 'edit')) WITH CHECK (public.has_permission('tables', 'edit'));

CREATE POLICY "qr_and_staff_table_carts" ON public.table_carts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "qr_and_staff_table_cart_items" ON public.table_cart_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "qr_insert_service_requests" ON public.table_service_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "staff_manage_service_requests" ON public.table_service_requests FOR SELECT USING (public.is_active_staff());
CREATE POLICY "staff_update_service_requests" ON public.table_service_requests FOR UPDATE
  USING (public.has_permission('tables', 'edit')) WITH CHECK (public.has_permission('tables', 'edit'));

-- Orders, Payments, Deliveries, Cash Drawers
CREATE POLICY "staff_read_orders" ON public.orders FOR SELECT USING (public.has_permission('orders', 'view'));
CREATE POLICY "staff_update_orders" ON public.orders FOR UPDATE
  USING (public.has_permission('orders', 'edit')) WITH CHECK (public.has_permission('orders', 'edit'));
CREATE POLICY "staff_read_order_items" ON public.order_items FOR SELECT USING (public.has_permission('orders', 'view') OR public.has_permission('kds', 'view'));
CREATE POLICY "staff_read_order_history" ON public.order_status_history FOR SELECT USING (public.has_permission('orders', 'view'));
CREATE POLICY "staff_read_reservations" ON public.stock_reservations FOR SELECT USING (public.has_permission('inventory', 'view'));

CREATE POLICY "staff_read_payments" ON public.payments FOR SELECT USING (public.has_permission('payments', 'view'));
CREATE POLICY "staff_insert_payments" ON public.payments FOR INSERT WITH CHECK (public.has_permission('payments', 'create'));
CREATE POLICY "staff_verify_payments" ON public.payments FOR UPDATE
  USING (public.has_permission('payments', 'approve')) WITH CHECK (public.has_permission('payments', 'approve'));

CREATE POLICY "staff_read_deliveries" ON public.deliveries FOR SELECT USING (public.has_permission('delivery', 'view'));
CREATE POLICY "staff_manage_deliveries" ON public.deliveries FOR ALL
  USING (public.has_permission('delivery', 'edit')) WITH CHECK (public.has_permission('delivery', 'edit'));

CREATE POLICY "staff_read_drawers" ON public.cash_drawers FOR SELECT USING (public.has_permission('cash_drawer', 'view'));
CREATE POLICY "staff_manage_drawers" ON public.cash_drawers FOR ALL
  USING (public.has_permission('settings', 'edit')) WITH CHECK (public.has_permission('settings', 'edit'));
CREATE POLICY "staff_read_shifts" ON public.cash_drawer_shifts FOR SELECT USING (public.has_permission('cash_drawer', 'view'));
CREATE POLICY "staff_manage_shifts" ON public.cash_drawer_shifts FOR ALL
  USING (public.has_permission('cash_drawer', 'create')) WITH CHECK (public.has_permission('cash_drawer', 'create'));
CREATE POLICY "staff_manage_cash_movements" ON public.cash_drawer_movements FOR ALL
  USING (public.has_permission('cash_drawer', 'create')) WITH CHECK (public.has_permission('cash_drawer', 'create'));

CREATE POLICY "staff_read_printers" ON public.printer_configs FOR SELECT USING (public.is_active_staff());
CREATE POLICY "staff_manage_printers" ON public.printer_configs FOR ALL
  USING (public.has_permission('settings', 'edit')) WITH CHECK (public.has_permission('settings', 'edit'));

CREATE POLICY "staff_notifications" ON public.in_app_notifications FOR ALL
  USING (public.is_active_staff()) WITH CHECK (public.is_active_staff());

-- =============================================================================
-- TRANSACTIONAL RPCs
-- =============================================================================

-- 1. Concurrency-Safe Order Placement + Smart Stock Reservation
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
  v_recipe_id uuid;
  v_req record;
  v_avail numeric(14,4);
BEGIN
  -- Idempotency check
  SELECT * INTO v_existing FROM public.orders WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  SELECT * INTO v_branch FROM public.branches WHERE id = p_branch_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Branch not found';
  END IF;

  SELECT * INTO v_tax FROM public.tax_profiles WHERE branch_id = p_branch_id AND is_default = true LIMIT 1;
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

  -- Compute subtotal from items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_subtotal := v_subtotal + ((v_item->>'unitPrice')::numeric * (v_item->>'quantity')::integer);
  END LOOP;

  v_discounted := GREATEST(0, v_subtotal - LEAST(v_subtotal, COALESCE(p_discount_total, 0)));
  IF v_tax.id IS NOT NULL AND NOT v_tax.is_exempt AND v_tax.tax_type = 'vat' AND v_tax.rate_percent > 0 THEN
    IF v_tax.pricing_mode = 'inclusive' THEN
      v_tax_total := round(v_discounted - (v_discounted / (1 + (v_tax.rate_percent / 100))), 2);
      v_total := round(v_discounted + COALESCE(p_delivery_fee, 0), 2);
    ELSE
      v_tax_total := round(v_discounted * (v_tax.rate_percent / 100), 2);
      v_total := round(v_discounted + v_tax_total + COALESCE(p_delivery_fee, 0), 2);
    END IF;
  ELSE
    v_tax_total := 0;
    v_total := round(v_discounted + COALESCE(p_delivery_fee, 0), 2);
  END IF;

  v_initial_status := CASE
    WHEN p_channel = 'pos' THEN 'confirmed'::order_status
    WHEN v_policy.approval_policy = 'staff_approval' THEN 'pending'::order_status
    ELSE 'confirmed'::order_status
  END;

  INSERT INTO public.orders (
    env_mode, branch_id, order_number, queue_number, channel, order_type, table_id,
    status, payment_status, customer_name, customer_phone, delivery_address, delivery_notes,
    delivery_fee, subtotal, discount_total, discount_reason, tax_total, total_amount,
    is_priority, order_notes, idempotency_key, created_by
  ) VALUES (
    p_env, p_branch_id, v_order_num, v_queue_num, p_channel, p_order_type, p_table_id,
    v_initial_status, 'unpaid', p_customer_name, p_customer_phone, p_delivery_address, p_delivery_notes,
    COALESCE(p_delivery_fee, 0), v_subtotal, COALESCE(p_discount_total, 0), p_discount_reason,
    v_tax_total, v_total, COALESCE(p_is_priority, false), p_order_notes, p_idempotency_key, auth.uid()
  ) RETURNING * INTO v_order;

  -- Insert order items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_prod FROM public.products WHERE id = (v_item->>'productId')::uuid;
    INSERT INTO public.order_items (
      order_id, product_id, variant_id, kds_station_id, product_name, variant_name,
      quantity, unit_price, modifiers, notes, unit_cost_snapshot, line_total
    ) VALUES (
      v_order.id,
      v_prod.id,
      NULLIF(v_item->>'variantId', '')::uuid,
      v_prod.kds_station_id,
      v_prod.name,
      v_item->>'variantName',
      (v_item->>'quantity')::integer,
      (v_item->>'unitPrice')::numeric,
      COALESCE(v_item->'modifiers', '[]'::jsonb),
      v_item->>'notes',
      COALESCE((v_item->>'unitCostSnapshot')::numeric, 0),
      (v_item->>'unitPrice')::numeric * (v_item->>'quantity')::integer
    );
  END LOOP;

  -- If confirmed immediately, reserve ingredients atomically
  IF v_initial_status = 'confirmed' THEN
    FOR v_req IN
      SELECT ri.ingredient_id, sum(ri.quantity * oi.quantity * (1 + r.waste_factor_percent / 100.0)) AS qty_needed
      FROM public.order_items oi
      JOIN public.recipes r ON r.product_id = oi.product_id AND (r.variant_id = oi.variant_id OR r.variant_id IS NULL)
      JOIN public.recipe_items ri ON ri.recipe_id = r.id
      WHERE oi.order_id = v_order.id
      GROUP BY ri.ingredient_id
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
  END IF;

  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by)
  VALUES (v_order.id, NULL, v_initial_status::text, COALESCE(p_customer_name, 'System'));

  IF p_table_id IS NOT NULL THEN
    UPDATE public.dining_tables SET status = 'occupied' WHERE id = p_table_id;
  END IF;

  IF p_order_type = 'delivery' THEN
    INSERT INTO public.deliveries (env_mode, branch_id, order_id, customer_name, customer_phone, address, delivery_instructions, delivery_fee)
    VALUES (p_env, p_branch_id, v_order.id, COALESCE(p_customer_name, 'Customer'), COALESCE(p_customer_phone, ''), COALESCE(p_delivery_address, ''), p_delivery_notes, COALESCE(p_delivery_fee, 0));
  END IF;

  RETURN v_order;
END;
$$;

-- 2. KDS Item Preparation Progression + Stock Consumption on Prep Start
CREATE OR REPLACE FUNCTION public.advance_kds_item_status(
  p_order_item_id uuid,
  p_next_status kds_ticket_status
)
RETURNS public.order_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.order_items%ROWTYPE;
  v_res record;
  v_new_balance numeric(14,4);
  v_all_ready boolean;
BEGIN
  IF NOT public.has_permission('kds', 'edit') THEN
    RAISE EXCEPTION 'Permission denied for KDS operation';
  END IF;

  SELECT * INTO v_item FROM public.order_items WHERE id = p_order_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order item not found';
  END IF;

  -- When moving to preparing for the first time, consume active reservations for the parent order
  IF p_next_status = 'preparing' THEN
    FOR v_res IN
      SELECT * FROM public.stock_reservations
      WHERE order_id = v_item.order_id AND status = 'active'
      FOR UPDATE
    LOOP
      UPDATE public.ingredients
      SET
        reserved_stock = GREATEST(0, reserved_stock - v_res.quantity),
        current_stock = GREATEST(0, current_stock - v_res.quantity)
      WHERE id = v_res.ingredient_id
      RETURNING current_stock INTO v_new_balance;

      UPDATE public.stock_reservations SET status = 'consumed', updated_at = now() WHERE id = v_res.id;

      INSERT INTO public.inventory_movements (
        env_mode, branch_id, ingredient_id, movement_type, quantity_delta,
        balance_after, reference_type, reference_id, reason, created_by
      ) VALUES (
        v_res.env_mode, v_res.branch_id, v_res.ingredient_id, 'consume', -v_res.quantity,
        v_new_balance, 'order', v_item.order_id::text, 'Consumed upon KDS preparation start', auth.uid()::text
      );
    END LOOP;

    UPDATE public.orders SET status = 'preparing', updated_at = now()
    WHERE id = v_item.order_id AND status = 'confirmed';
  END IF;

  UPDATE public.order_items
  SET
    kds_status = p_next_status,
    prep_started_at = CASE WHEN p_next_status = 'preparing' AND prep_started_at IS NULL THEN now() ELSE prep_started_at END,
    prep_ready_at = CASE WHEN p_next_status IN ('ready', 'bumped') AND prep_ready_at IS NULL THEN now() ELSE prep_ready_at END
  WHERE id = p_order_item_id
  RETURNING * INTO v_item;

  -- Check if ALL active items in order are ready/bumped before marking order ready
  SELECT NOT EXISTS (
    SELECT 1 FROM public.order_items
    WHERE order_id = v_item.order_id AND kds_status NOT IN ('ready', 'bumped', 'cancelled')
  ) INTO v_all_ready;

  IF v_all_ready THEN
    UPDATE public.orders SET status = 'ready', updated_at = now() WHERE id = v_item.order_id AND status <> 'completed';
  END IF;

  RETURN v_item;
END;
$$;
