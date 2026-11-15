-- =============================================================================
-- KapeOS Phase 1 Staging Readiness & Final Security Hardening Migration
-- Fixes:
--   1. Replace pgcrypto-dependent column defaults with search_path-safe gen_random_uuid() hex tokens
--   2. Add payments, deliveries, and cash_drawer_shifts to supabase_realtime publication
--   3. Restrict dining_tables SELECT to active staff (prevent anon QR token enumeration)
--   4. Scope orders UPDATE, order_items SELECT, user_profiles SELECT, and in_app_notifications by env/branch
--   5. Add complete_order_transactional RPC & branch/env check in verify_payment_transactional
-- =============================================================================

-- 1. Search_path-safe token defaults (avoids extensions.gen_random_bytes lookup issues inside SECURITY DEFINER RPCs)
ALTER TABLE public.dining_tables
  ALTER COLUMN qr_token SET DEFAULT replace(gen_random_uuid()::text, '-', '');

ALTER TABLE public.orders
  ALTER COLUMN tracking_token SET DEFAULT replace(gen_random_uuid()::text, '-', '');

-- 2. Ensure Realtime publication covers ALL tables subscribed by productionService.ts
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.deliveries;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_drawer_shifts;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Prevent anonymous visitors from listing all tables' QR tokens
DROP POLICY IF EXISTS "read_tables" ON public.dining_tables;
CREATE POLICY "staff_read_tables" ON public.dining_tables FOR SELECT
  USING (
    public.is_active_staff()
    AND env_mode = public.current_staff_env()
    AND branch_id = public.current_staff_branch()
  );

-- 4. Tighten branch & env isolation on orders, order_items, user_profiles, and notifications
DROP POLICY IF EXISTS "staff_update_orders" ON public.orders;
CREATE POLICY "staff_update_orders" ON public.orders FOR UPDATE
  USING (
    public.has_permission('orders', 'edit')
    AND env_mode = public.current_staff_env()
    AND branch_id = public.current_staff_branch()
  )
  WITH CHECK (
    public.has_permission('orders', 'edit')
    AND env_mode = public.current_staff_env()
    AND branch_id = public.current_staff_branch()
  );

DROP POLICY IF EXISTS "staff_read_order_items" ON public.order_items;
CREATE POLICY "staff_read_order_items" ON public.order_items FOR SELECT
  USING (
    (public.has_permission('orders', 'view') OR public.has_permission('kds', 'view'))
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND o.env_mode = public.current_staff_env()
        AND o.branch_id = public.current_staff_branch()
    )
  );

DROP POLICY IF EXISTS "staff_read_own_or_admin_profiles" ON public.user_profiles;
CREATE POLICY "staff_read_own_or_admin_profiles" ON public.user_profiles FOR SELECT
  USING (
    id = auth.uid()
    OR (
      public.has_permission('staff', 'view')
      AND env_mode = public.current_staff_env()
      AND branch_id = public.current_staff_branch()
    )
  );

DROP POLICY IF EXISTS "staff_notifications" ON public.in_app_notifications;
CREATE POLICY "staff_notifications" ON public.in_app_notifications FOR ALL
  USING (
    public.is_active_staff()
    AND env_mode = public.current_staff_env()
    AND branch_id = public.current_staff_branch()
  )
  WITH CHECK (
    public.is_active_staff()
    AND env_mode = public.current_staff_env()
    AND branch_id = public.current_staff_branch()
  );

-- 5. Transactional Order Completion RPC (bumps ready KDS items & releases table atomically)
CREATE OR REPLACE FUNCTION public.complete_order_transactional(p_order_id uuid)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_prev_status text;
  v_actor text;
BEGIN
  IF NOT public.has_permission('orders', 'edit') THEN
    RAISE EXCEPTION 'Permission denied: orders.edit required';
  END IF;

  SELECT full_name INTO v_actor FROM public.user_profiles WHERE id = auth.uid();
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF v_order.env_mode <> public.current_staff_env() OR v_order.branch_id <> public.current_staff_branch() THEN
    RAISE EXCEPTION 'Branch or environment mismatch';
  END IF;
  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cancelled order cannot be completed';
  END IF;
  IF v_order.status = 'completed' THEN
    RETURN v_order;
  END IF;

  v_prev_status := v_order.status::text;

  UPDATE public.order_items
  SET kds_status = 'bumped'
  WHERE order_id = p_order_id AND kds_status = 'ready';

  UPDATE public.orders
  SET status = 'completed', updated_at = now()
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  IF v_order.table_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.orders
      WHERE table_id = v_order.table_id AND id <> v_order.id AND status NOT IN ('completed', 'cancelled')
    ) THEN
      UPDATE public.dining_tables SET status = 'available' WHERE id = v_order.table_id;
    END IF;
  END IF;

  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by)
  VALUES (p_order_id, v_prev_status, 'completed', COALESCE(v_actor, 'Staff'));

  RETURN v_order;
END;
$$;

-- 6. Enforce branch & env isolation on verify_payment_transactional
CREATE OR REPLACE FUNCTION public.verify_payment_transactional(
  p_payment_id uuid,
  p_approve boolean,
  p_rejection_reason text DEFAULT NULL
)
RETURNS public.payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_verifier_name text;
  v_paid_total numeric(12,2);
  v_order_total numeric(12,2);
BEGIN
  IF NOT public.has_permission('payments', 'approve') THEN
    RAISE EXCEPTION 'Permission denied: payments.approve required';
  END IF;

  SELECT full_name INTO v_verifier_name FROM public.user_profiles WHERE id = auth.uid();

  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment record not found';
  END IF;
  IF v_payment.env_mode <> public.current_staff_env() OR v_payment.branch_id <> public.current_staff_branch() THEN
    RAISE EXCEPTION 'Branch or environment mismatch';
  END IF;

  IF v_payment.status <> 'pending_verification' THEN
    RETURN v_payment;
  END IF;

  IF p_approve THEN
    UPDATE public.payments
    SET
      status = 'verified',
      verified_by = auth.uid(),
      verified_by_name = COALESCE(v_verifier_name, 'Staff'),
      verified_at = now()
    WHERE id = p_payment_id
    RETURNING * INTO v_payment;

    SELECT COALESCE(sum(amount), 0) INTO v_paid_total
    FROM public.payments
    WHERE order_id = v_payment.order_id AND status = 'verified';

    SELECT total_amount INTO v_order_total FROM public.orders WHERE id = v_payment.order_id;

    UPDATE public.orders
    SET
      payment_status = CASE WHEN v_paid_total >= v_order_total THEN 'paid'::payment_status ELSE 'pending_verification'::payment_status END,
      updated_at = now()
    WHERE id = v_payment.order_id;
  ELSE
    UPDATE public.payments
    SET
      status = 'rejected',
      verified_by = auth.uid(),
      verified_by_name = COALESCE(v_verifier_name, 'Staff'),
      verified_at = now(),
      rejection_reason = COALESCE(p_rejection_reason, 'Verification rejected')
    WHERE id = p_payment_id
    RETURNING * INTO v_payment;

    UPDATE public.orders SET payment_status = 'failed', updated_at = now() WHERE id = v_payment.order_id;
  END IF;

  INSERT INTO public.audit_logs (env_mode, branch_id, actor_user_id, actor_name, action, module, target_id, reason)
  VALUES (
    v_payment.env_mode, v_payment.branch_id, auth.uid(), COALESCE(v_verifier_name, 'Staff'),
    CASE WHEN p_approve THEN 'payment_verified' ELSE 'payment_rejected' END,
    'payments', p_payment_id::text, p_rejection_reason
  );

  RETURN v_payment;
END;
$$;
