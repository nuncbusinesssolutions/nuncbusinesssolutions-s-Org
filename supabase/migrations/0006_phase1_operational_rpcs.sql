-- =============================================================================
-- KapeOS Phase 1 Audit Hardening Part 2: Atomic Operational RPCs & Branch RLS
-- =============================================================================

-- 1. Enforce strict env_mode + branch_id isolation across remaining operational RLS policies
DROP POLICY IF EXISTS "staff_read_payments" ON public.payments;
CREATE POLICY "staff_read_payments" ON public.payments FOR SELECT
  USING (
    public.has_permission('payments', 'view')
    AND env_mode = public.current_staff_env()
    AND branch_id = public.current_staff_branch()
  );

DROP POLICY IF EXISTS "staff_read_deliveries" ON public.deliveries;
CREATE POLICY "staff_read_deliveries" ON public.deliveries FOR SELECT
  USING (
    public.has_permission('delivery', 'view')
    AND env_mode = public.current_staff_env()
    AND branch_id = public.current_staff_branch()
  );

DROP POLICY IF EXISTS "staff_read_shifts" ON public.cash_drawer_shifts;
CREATE POLICY "staff_read_shifts" ON public.cash_drawer_shifts FOR SELECT
  USING (
    public.has_permission('cash_drawer', 'view')
    AND env_mode = public.current_staff_env()
    AND branch_id = public.current_staff_branch()
  );

DROP POLICY IF EXISTS "staff_read_movements" ON public.inventory_movements;
CREATE POLICY "staff_read_movements" ON public.inventory_movements FOR SELECT
  USING (
    public.has_permission('inventory', 'view')
    AND env_mode = public.current_staff_env()
    AND branch_id = public.current_staff_branch()
  );

DROP POLICY IF EXISTS "staff_read_reservations" ON public.stock_reservations;
CREATE POLICY "staff_read_reservations" ON public.stock_reservations FOR SELECT
  USING (
    public.has_permission('inventory', 'view')
    AND env_mode = public.current_staff_env()
    AND branch_id = public.current_staff_branch()
  );

DROP POLICY IF EXISTS "audit_read" ON public.audit_logs;
CREATE POLICY "audit_read" ON public.audit_logs FOR SELECT
  USING (
    public.has_permission('audit', 'view')
    AND env_mode = public.current_staff_env()
    AND (branch_id IS NULL OR branch_id = public.current_staff_branch())
  );

-- Replace open qr_insert_service_requests with token-scoped RPC
DROP POLICY IF EXISTS "qr_insert_service_requests" ON public.table_service_requests;
CREATE POLICY "staff_insert_service_requests" ON public.table_service_requests FOR INSERT
  WITH CHECK (public.is_active_staff() AND env_mode = public.current_staff_env() AND branch_id = public.current_staff_branch());

CREATE OR REPLACE FUNCTION public.create_qr_service_request(
  p_qr_token text,
  p_request_type text,
  p_notes text DEFAULT NULL
)
RETURNS public.table_service_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table public.dining_tables%ROWTYPE;
  v_req public.table_service_requests%ROWTYPE;
BEGIN
  IF p_request_type NOT IN ('call_waiter', 'request_bill') THEN
    RAISE EXCEPTION 'Invalid service request type';
  END IF;

  SELECT * INTO v_table FROM public.dining_tables WHERE qr_token = p_qr_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid table QR token';
  END IF;

  INSERT INTO public.table_service_requests (env_mode, branch_id, table_id, request_type, status, notes)
  VALUES (v_table.env_mode, v_table.branch_id, v_table.id, p_request_type, 'open', p_notes)
  RETURNING * INTO v_req;

  INSERT INTO public.in_app_notifications (env_mode, branch_id, category, title, message, reference_id)
  VALUES (
    v_table.env_mode,
    v_table.branch_id,
    'table_service',
    v_table.table_number || ': ' || CASE WHEN p_request_type = 'call_waiter' THEN 'Waiter Requested' ELSE 'Bill Requested' END,
    COALESCE(NULLIF(trim(p_notes), ''), 'Customer requested counter attention via table QR.'),
    v_table.id::text
  );

  RETURN v_req;
END;
$$;

-- 2. Atomic Record Payment RPC (Staff Cash Auto-Verify + Digital Pending Verification + Idempotency)
CREATE OR REPLACE FUNCTION public.record_payment_transactional(
  p_order_id uuid,
  p_method payment_method,
  p_amount numeric,
  p_reference_number text DEFAULT NULL,
  p_proof_url text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS public.payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := COALESCE(NULLIF(trim(p_idempotency_key), ''), 'pay_' || gen_random_uuid()::text);
  v_existing public.payments%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_actor_name text;
  v_is_cash_verified boolean := false;
  v_payment public.payments%ROWTYPE;
  v_paid_total numeric(12,2);
  v_open_shift public.cash_drawer_shifts%ROWTYPE;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero';
  END IF;

  SELECT * INTO v_existing FROM public.payments WHERE idempotency_key = v_key;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot record payment for a cancelled order';
  END IF;

  IF p_method = 'cash' THEN
    IF NOT public.has_permission('payments', 'create') THEN
      RAISE EXCEPTION 'Permission denied: payments.create required for cash collection';
    END IF;
    v_is_cash_verified := true;
  ELSE
    IF COALESCE(length(trim(p_reference_number)), 0) < 4 THEN
      RAISE EXCEPTION 'Reference number (min 4 characters) is required for non-cash payments';
    END IF;
  END IF;

  SELECT full_name INTO v_actor_name FROM public.user_profiles WHERE id = auth.uid();

  INSERT INTO public.payments (
    env_mode, branch_id, order_id, method, amount, reference_number, proof_url,
    status, verified_by, verified_by_name, verified_at, idempotency_key
  ) VALUES (
    v_order.env_mode,
    v_order.branch_id,
    v_order.id,
    p_method,
    round(p_amount, 2),
    NULLIF(trim(p_reference_number), ''),
    NULLIF(trim(p_proof_url), ''),
    CASE WHEN v_is_cash_verified THEN 'verified'::payment_verification_status ELSE 'pending_verification'::payment_verification_status END,
    CASE WHEN v_is_cash_verified THEN auth.uid() ELSE NULL END,
    CASE WHEN v_is_cash_verified THEN COALESCE(v_actor_name, 'Cashier') ELSE NULL END,
    CASE WHEN v_is_cash_verified THEN now() ELSE NULL END,
    v_key
  ) RETURNING * INTO v_payment;

  IF v_is_cash_verified THEN
    SELECT COALESCE(sum(amount), 0) INTO v_paid_total
    FROM public.payments WHERE order_id = v_order.id AND status = 'verified';

    UPDATE public.orders
    SET payment_status = CASE WHEN v_paid_total >= v_order.total_amount THEN 'paid'::payment_status ELSE 'pending_verification'::payment_status END,
        updated_at = now()
    WHERE id = v_order.id;

    SELECT * INTO v_open_shift
    FROM public.cash_drawer_shifts
    WHERE env_mode = v_order.env_mode AND branch_id = v_order.branch_id AND status = 'open'
    ORDER BY opened_at DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      UPDATE public.cash_drawer_shifts
      SET
        cash_sales_expected = round(cash_sales_expected + v_payment.amount, 2),
        expected_cash = round(opening_cash + cash_sales_expected + v_payment.amount + cash_in_total - cash_out_total, 2)
      WHERE id = v_open_shift.id;
    END IF;
  ELSE
    UPDATE public.orders
    SET payment_status = 'pending_verification'::payment_status,
        updated_at = now()
    WHERE id = v_order.id AND payment_status = 'unpaid';
  END IF;

  INSERT INTO public.audit_logs (env_mode, branch_id, actor_user_id, actor_name, action, module, target_id, metadata)
  VALUES (
    v_order.env_mode, v_order.branch_id, auth.uid(), COALESCE(v_actor_name, 'Customer/System'),
    CASE WHEN v_is_cash_verified THEN 'cash_payment_recorded' ELSE 'digital_payment_submitted' END,
    'payments', v_payment.id::text,
    jsonb_build_object('order_id', v_order.id, 'method', p_method, 'amount', v_payment.amount)
  );

  RETURN v_payment;
END;
$$;

-- 3. Atomic Stock Adjustment RPC
CREATE OR REPLACE FUNCTION public.stock_adjust_ingredient_transactional(
  p_ingredient_id uuid,
  p_delta numeric,
  p_type movement_type,
  p_reason text
)
RETURNS public.ingredients
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ing public.ingredients%ROWTYPE;
  v_actor text;
  v_applied numeric(14,4);
  v_new_bal numeric(14,4);
BEGIN
  IF NOT public.has_permission('inventory', 'edit') THEN
    RAISE EXCEPTION 'Permission denied: inventory.edit required';
  END IF;
  IF COALESCE(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'Adjustment reason is required';
  END IF;
  IF p_type NOT IN ('stock_in', 'stock_out', 'adjustment', 'waste') THEN
    RAISE EXCEPTION 'Unsupported manual stock movement type';
  END IF;

  SELECT full_name INTO v_actor FROM public.user_profiles WHERE id = auth.uid();
  SELECT * INTO v_ing FROM public.ingredients WHERE id = p_ingredient_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ingredient not found';
  END IF;

  v_applied := CASE WHEN p_type IN ('stock_out', 'waste') THEN -abs(p_delta) ELSE p_delta END;
  v_new_bal := round(v_ing.current_stock + v_applied, 4);

  IF v_new_bal < v_ing.reserved_stock THEN
    RAISE EXCEPTION 'Cannot reduce stock below active reserved quantity (% %)', v_ing.reserved_stock, v_ing.recipe_unit;
  END IF;

  UPDATE public.ingredients
  SET current_stock = v_new_bal
  WHERE id = p_ingredient_id
  RETURNING * INTO v_ing;

  INSERT INTO public.inventory_movements (
    env_mode, branch_id, ingredient_id, movement_type, quantity_delta,
    balance_after, unit_cost, reason, created_by
  ) VALUES (
    v_ing.env_mode, v_ing.branch_id, v_ing.id, p_type, v_applied,
    v_new_bal, v_ing.unit_cost, p_reason, COALESCE(v_actor, 'Staff')
  );

  PERFORM public.recompute_product_availability(v_ing.branch_id, v_ing.env_mode);

  IF (v_ing.current_stock - v_ing.reserved_stock) <= v_ing.reorder_point THEN
    INSERT INTO public.in_app_notifications (env_mode, branch_id, target_role, category, title, message, reference_id)
    VALUES (
      v_ing.env_mode, v_ing.branch_id, 'manager', 'low_stock',
      'Low Stock Alert: ' || v_ing.name,
      'Available ' || round(v_ing.current_stock - v_ing.reserved_stock, 2) || ' ' || v_ing.recipe_unit || ' (Reorder at ' || v_ing.reorder_point || ' ' || v_ing.recipe_unit || ').',
      v_ing.id::text
    );
  END IF;

  INSERT INTO public.audit_logs (env_mode, branch_id, actor_user_id, actor_name, action, module, target_id, reason, metadata)
  VALUES (
    v_ing.env_mode, v_ing.branch_id, auth.uid(), COALESCE(v_actor, 'Staff'),
    'inventory_' || p_type::text, 'inventory', v_ing.id::text, p_reason,
    jsonb_build_object('delta', v_applied, 'balance_after', v_new_bal)
  );

  RETURN v_ing;
END;
$$;

-- 4. Override Product Availability RPC
CREATE OR REPLACE FUNCTION public.override_product_availability_transactional(
  p_product_id uuid,
  p_available boolean,
  p_reason text
)
RETURNS public.products
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prod public.products%ROWTYPE;
  v_actor text;
BEGIN
  IF NOT public.has_permission('menu', 'edit') THEN
    RAISE EXCEPTION 'Permission denied: menu.edit required';
  END IF;
  IF COALESCE(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'Override reason is required';
  END IF;

  SELECT full_name INTO v_actor FROM public.user_profiles WHERE id = auth.uid();

  UPDATE public.products
  SET
    manual_unavailable = NOT p_available,
    unavailable_reason = CASE WHEN p_available THEN NULL ELSE p_reason END,
    is_available = p_available
  WHERE id = p_product_id
  RETURNING * INTO v_prod;

  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;

  IF p_available THEN
    PERFORM public.recompute_product_availability(v_prod.branch_id, v_prod.env_mode);
    SELECT * INTO v_prod FROM public.products WHERE id = p_product_id;
  END IF;

  INSERT INTO public.availability_overrides (env_mode, product_id, overridden_by, is_available, reason)
  VALUES (v_prod.env_mode, v_prod.id, auth.uid(), p_available, p_reason);

  INSERT INTO public.audit_logs (env_mode, branch_id, actor_user_id, actor_name, action, module, target_id, reason)
  VALUES (
    v_prod.env_mode, v_prod.branch_id, auth.uid(), COALESCE(v_actor, 'Staff'),
    CASE WHEN p_available THEN 'product_availability_restored' ELSE 'product_marked_unavailable' END,
    'menu', v_prod.id::text, p_reason
  );

  RETURN v_prod;
END;
$$;

-- 5. Cash Drawer Shift Movements, Closing & Approval RPCs
CREATE OR REPLACE FUNCTION public.add_cash_movement_transactional(
  p_shift_id uuid,
  p_type text,
  p_amount numeric,
  p_reason text
)
RETURNS public.cash_drawer_shifts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shift public.cash_drawer_shifts%ROWTYPE;
  v_actor text;
BEGIN
  IF NOT public.has_permission('cash_drawer', 'create') THEN
    RAISE EXCEPTION 'Permission denied: cash_drawer.create required';
  END IF;
  IF p_type NOT IN ('cash_in', 'cash_out') THEN
    RAISE EXCEPTION 'Invalid cash movement type';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;
  IF COALESCE(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'Reason is required';
  END IF;

  SELECT full_name INTO v_actor FROM public.user_profiles WHERE id = auth.uid();
  SELECT * INTO v_shift FROM public.cash_drawer_shifts WHERE id = p_shift_id FOR UPDATE;
  IF NOT FOUND OR v_shift.status <> 'open' THEN
    RAISE EXCEPTION 'Open cash shift not found';
  END IF;

  INSERT INTO public.cash_drawer_movements (shift_id, type, amount, reason, created_by)
  VALUES (p_shift_id, p_type, round(p_amount, 2), p_reason, COALESCE(v_actor, 'Cashier'));

  UPDATE public.cash_drawer_shifts
  SET
    cash_in_total = cash_in_total + CASE WHEN p_type = 'cash_in' THEN round(p_amount, 2) ELSE 0 END,
    cash_out_total = cash_out_total + CASE WHEN p_type = 'cash_out' THEN round(p_amount, 2) ELSE 0 END,
    expected_cash = round(
      opening_cash + cash_sales_expected +
      (cash_in_total + CASE WHEN p_type = 'cash_in' THEN round(p_amount, 2) ELSE 0 END) -
      (cash_out_total + CASE WHEN p_type = 'cash_out' THEN round(p_amount, 2) ELSE 0 END),
      2
    )
  WHERE id = p_shift_id
  RETURNING * INTO v_shift;

  RETURN v_shift;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_cash_shift_transactional(
  p_shift_id uuid,
  p_denominations jsonb,
  p_notes text DEFAULT NULL
)
RETURNS public.cash_drawer_shifts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shift public.cash_drawer_shifts%ROWTYPE;
  v_actor text;
  v_denoms numeric[] := ARRAY[1000, 500, 200, 100, 50, 20, 10, 5, 1, 0.25];
  v_d numeric;
  v_cnt integer;
  v_actual numeric(12,2) := 0;
  v_variance numeric(12,2);
  v_next_status shift_status;
BEGIN
  IF NOT (public.has_permission('cash_drawer', 'edit') OR public.has_permission('cash_drawer', 'create')) THEN
    RAISE EXCEPTION 'Permission denied: cash_drawer access required';
  END IF;

  SELECT full_name INTO v_actor FROM public.user_profiles WHERE id = auth.uid();
  SELECT * INTO v_shift FROM public.cash_drawer_shifts WHERE id = p_shift_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shift not found'; END IF;
  IF v_shift.status <> 'open' THEN RETURN v_shift; END IF;

  FOREACH v_d IN ARRAY v_denoms
  LOOP
    v_cnt := GREATEST(0, COALESCE((p_denominations->>(v_d::text))::integer, 0));
    v_actual := v_actual + round(v_d * v_cnt, 2);
  END LOOP;

  v_variance := round(v_actual - v_shift.expected_cash, 2);
  v_next_status := CASE WHEN abs(v_variance) > 50 THEN 'pending_approval'::shift_status ELSE 'closed'::shift_status END;

  UPDATE public.cash_drawer_shifts
  SET
    denominations = p_denominations,
    actual_cash = v_actual,
    variance = v_variance,
    status = v_next_status,
    closed_at = now(),
    notes = p_notes,
    approved_by = CASE WHEN v_next_status = 'closed' THEN auth.uid() ELSE NULL END,
    approved_by_name = CASE WHEN v_next_status = 'closed' THEN COALESCE(v_actor, 'Cashier') ELSE NULL END
  WHERE id = p_shift_id
  RETURNING * INTO v_shift;

  INSERT INTO public.audit_logs (env_mode, branch_id, actor_user_id, actor_name, action, module, target_id, reason, metadata)
  VALUES (
    v_shift.env_mode, v_shift.branch_id, auth.uid(), COALESCE(v_actor, 'Cashier'),
    'cash_shift_closed', 'cash_drawer', p_shift_id::text, p_notes,
    jsonb_build_object('expected', v_shift.expected_cash, 'actual', v_actual, 'variance', v_variance, 'status', v_next_status)
  );

  RETURN v_shift;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_cash_shift_transactional(p_shift_id uuid)
RETURNS public.cash_drawer_shifts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shift public.cash_drawer_shifts%ROWTYPE;
  v_actor text;
BEGIN
  IF NOT public.has_permission('cash_drawer', 'approve') THEN
    RAISE EXCEPTION 'Permission denied: cash_drawer.approve required';
  END IF;

  SELECT full_name INTO v_actor FROM public.user_profiles WHERE id = auth.uid();
  SELECT * INTO v_shift FROM public.cash_drawer_shifts WHERE id = p_shift_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shift not found'; END IF;
  IF v_shift.status = 'closed' THEN RETURN v_shift; END IF;

  UPDATE public.cash_drawer_shifts
  SET status = 'closed', approved_by = auth.uid(), approved_by_name = COALESCE(v_actor, 'Manager')
  WHERE id = p_shift_id
  RETURNING * INTO v_shift;

  INSERT INTO public.audit_logs (env_mode, branch_id, actor_user_id, actor_name, action, module, target_id)
  VALUES (v_shift.env_mode, v_shift.branch_id, auth.uid(), COALESCE(v_actor, 'Manager'), 'cash_shift_approved', 'cash_drawer', p_shift_id::text);

  RETURN v_shift;
END;
$$;

-- 6. Delivery Status & Proof-of-Delivery OTP Verification RPC
CREATE OR REPLACE FUNCTION public.update_delivery_status_transactional(
  p_delivery_id uuid,
  p_status delivery_status,
  p_otp_input text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS public.deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_del public.deliveries%ROWTYPE;
  v_actor text;
BEGIN
  IF NOT public.has_permission('delivery', 'edit') THEN
    RAISE EXCEPTION 'Permission denied: delivery.edit required';
  END IF;

  SELECT full_name INTO v_actor FROM public.user_profiles WHERE id = auth.uid();
  SELECT * INTO v_del FROM public.deliveries WHERE id = p_delivery_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Delivery record not found'; END IF;

  IF p_status = 'delivered' AND v_del.otp_code IS NOT NULL AND trim(COALESCE(p_otp_input, '')) <> v_del.otp_code THEN
    RAISE EXCEPTION 'Customer delivery OTP does not match';
  END IF;

  IF p_status = 'failed' AND COALESCE(trim(p_notes), '') = '' THEN
    RAISE EXCEPTION 'Failure reason is required when marking delivery failed';
  END IF;

  UPDATE public.deliveries
  SET
    delivery_status = p_status,
    failed_reason = CASE WHEN p_status = 'failed' THEN p_notes ELSE failed_reason END,
    rider_notes = CASE WHEN p_status <> 'failed' AND COALESCE(trim(p_notes), '') <> '' THEN p_notes ELSE rider_notes END,
    delivered_at = CASE WHEN p_status = 'delivered' THEN now() ELSE delivered_at END
  WHERE id = p_delivery_id
  RETURNING * INTO v_del;

  IF p_status = 'delivered' THEN
    UPDATE public.orders SET status = 'completed', updated_at = now() WHERE id = v_del.order_id;
  END IF;

  INSERT INTO public.audit_logs (env_mode, branch_id, actor_user_id, actor_name, action, module, target_id, reason, metadata)
  VALUES (
    v_del.env_mode, v_del.branch_id, auth.uid(), COALESCE(v_actor, 'Rider'),
    'delivery_status_updated', 'delivery', p_delivery_id::text, p_notes,
    jsonb_build_object('status', p_status)
  );

  RETURN v_del;
END;
$$;

-- 7. Prevent privilege escalation: only active super_admin may manage permission overrides or promote roles
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role_key = 'super_admin' AND up.is_active = true
  );
$$;

DROP POLICY IF EXISTS "admin_manage_overrides" ON public.user_permission_overrides;
CREATE POLICY "admin_manage_overrides" ON public.user_permission_overrides FOR ALL
  USING (
    public.is_super_admin()
    AND EXISTS (
      SELECT 1 FROM public.user_profiles target
      WHERE target.id = user_id AND target.env_mode = public.current_staff_env()
    )
  )
  WITH CHECK (
    public.is_super_admin()
    AND EXISTS (
      SELECT 1 FROM public.user_profiles target
      WHERE target.id = user_id AND target.env_mode = public.current_staff_env()
    )
  );

DROP POLICY IF EXISTS "admin_manage_profiles" ON public.user_profiles;
CREATE POLICY "admin_manage_profiles" ON public.user_profiles FOR UPDATE
  USING (
    public.has_permission('staff', 'edit')
    AND env_mode = public.current_staff_env()
    AND branch_id = public.current_staff_branch()
    AND (role_key <> 'super_admin' OR public.is_super_admin())
  )
  WITH CHECK (
    public.has_permission('staff', 'edit')
    AND env_mode = public.current_staff_env()
    AND branch_id = public.current_staff_branch()
    AND (role_key <> 'super_admin' OR public.is_super_admin())
  );

-- Scope table_cart_items staff RLS strictly by parent table_cart's env_mode + branch_id
DROP POLICY IF EXISTS "staff_manage_table_cart_items" ON public.table_cart_items;
CREATE POLICY "staff_manage_table_cart_items" ON public.table_cart_items FOR ALL
  USING (
    public.is_active_staff()
    AND EXISTS (
      SELECT 1 FROM public.table_carts tc
      WHERE tc.id = cart_id
        AND tc.env_mode = public.current_staff_env()
        AND tc.branch_id = public.current_staff_branch()
    )
  )
  WITH CHECK (
    public.is_active_staff()
    AND EXISTS (
      SELECT 1 FROM public.table_carts tc
      WHERE tc.id = cart_id
        AND tc.env_mode = public.current_staff_env()
        AND tc.branch_id = public.current_staff_branch()
    )
  );

-- 8. Ensure confirm_pending_order_transactional reserves BOTH recipe and modifier ingredient demand + branch check
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
  IF v_order.env_mode <> public.current_staff_env() OR v_order.branch_id <> public.current_staff_branch() THEN
    RAISE EXCEPTION 'Branch or environment mismatch';
  END IF;
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

-- 9. Ensure refund_payment_transactional enforces branch isolation & adjusts open cash shift on cash refund
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
  v_open_shift public.cash_drawer_shifts%ROWTYPE;
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
  IF v_payment.env_mode <> public.current_staff_env() OR v_payment.branch_id <> public.current_staff_branch() THEN
    RAISE EXCEPTION 'Branch or environment mismatch';
  END IF;
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

  IF v_payment.method = 'cash' THEN
    SELECT * INTO v_open_shift
    FROM public.cash_drawer_shifts
    WHERE env_mode = v_payment.env_mode AND branch_id = v_payment.branch_id AND status = 'open'
    ORDER BY opened_at DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      UPDATE public.cash_drawer_shifts
      SET
        cash_sales_expected = GREATEST(0, round(cash_sales_expected - v_payment.amount, 2)),
        expected_cash = GREATEST(0, round(opening_cash + GREATEST(0, cash_sales_expected - v_payment.amount) + cash_in_total - cash_out_total, 2))
      WHERE id = v_open_shift.id;
    END IF;
  END IF;

  INSERT INTO public.audit_logs (env_mode, branch_id, actor_user_id, actor_name, action, module, target_id, reason, metadata)
  VALUES (
    v_payment.env_mode, v_payment.branch_id, auth.uid(), COALESCE(v_actor_name, 'Staff'),
    'payment_refunded', 'payments', p_payment_id::text, p_reason,
    jsonb_build_object('amount', v_payment.amount, 'method', v_payment.method)
  );

  RETURN v_payment;
END;
$$;

