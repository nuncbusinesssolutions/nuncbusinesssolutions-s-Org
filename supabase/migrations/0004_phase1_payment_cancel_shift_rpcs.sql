-- =============================================================================
-- KapeOS Phase 1 Payment Verification, Cancellation, & Cash Shift RPCs
-- =============================================================================

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

  v_prep_started := v_order.status IN ('preparing', 'ready', 'completed');
  IF v_prep_started AND NOT public.has_permission('orders', 'approve') THEN
    RAISE EXCEPTION 'Manager approval required to cancel an order after preparation started';
  END IF;

  -- Release ONLY active (unconsumed) reservations. Never restore already-consumed stock automatically.
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

  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, reason)
  VALUES (p_order_id, v_order.status::text, 'cancelled', COALESCE(v_actor_name, 'Staff'), p_reason);

  INSERT INTO public.audit_logs (env_mode, branch_id, actor_user_id, actor_name, action, module, target_id, reason, metadata)
  VALUES (
    v_order.env_mode, v_order.branch_id, auth.uid(), COALESCE(v_actor_name, 'Staff'),
    'order_cancelled', 'orders', p_order_id::text, p_reason,
    jsonb_build_object('prep_started', v_prep_started)
  );

  RETURN v_order;
END;
$$;
