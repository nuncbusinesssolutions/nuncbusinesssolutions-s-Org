-- =============================================================================
-- KapeOS Phase 1 Supabase Storage Buckets & Policies
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('cafe-assets', 'cafe-assets', true),
  ('payment-proofs', 'payment-proofs', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "public_read_cafe_assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'cafe-assets');

CREATE POLICY "staff_upload_cafe_assets"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'cafe-assets' AND public.has_permission('menu', 'edit'));

CREATE POLICY "staff_read_payment_proofs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'payment-proofs' AND public.has_permission('payments', 'view'));

CREATE POLICY "upload_payment_proofs"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'payment-proofs');
