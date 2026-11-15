-- =============================================================================
-- KapeOS Phase 1 Core PostgreSQL Schema (Multi-Branch Ready, Single Business)
-- Currency default: PHP (₱) | Timezone default: Asia/Manila
-- Supports isolated 'production' and 'demo' environments via env_mode.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enums
DO $$ BEGIN
  CREATE TYPE env_mode AS ENUM ('production', 'demo');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE staff_role_key AS ENUM ('super_admin', 'manager', 'cashier', 'barista', 'rider');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE tax_type AS ENUM ('vat', 'non_vat');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE tax_pricing_mode AS ENUM ('inclusive', 'exclusive');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE order_channel AS ENUM ('pos', 'qr_table', 'kiosk', 'online');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE order_type AS ENUM ('dine_in', 'takeout', 'delivery');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM ('pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('unpaid', 'pending_verification', 'paid', 'failed', 'refunded', 'partially_refunded');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM ('cash', 'gcash', 'maya', 'card', 'bank_transfer');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE payment_verification_status AS ENUM ('pending_verification', 'verified', 'rejected', 'refunded');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE delivery_status AS ENUM ('unassigned', 'assigned', 'picked_up', 'in_transit', 'delivered', 'failed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE table_status AS ENUM ('available', 'occupied', 'reserved', 'unavailable');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE kds_ticket_status AS ENUM ('queued', 'preparing', 'ready', 'bumped', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE channel_approval_policy AS ENUM ('auto_confirm', 'staff_approval', 'auto_with_exception');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE movement_type AS ENUM ('stock_in', 'stock_out', 'adjustment', 'reserve', 'release', 'consume', 'waste');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE shift_status AS ENUM ('open', 'pending_approval', 'closed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 1. Business & Branch Configuration
CREATE TABLE IF NOT EXISTS public.business_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_mode env_mode NOT NULL UNIQUE,
  business_name text NOT NULL,
  logo_url text,
  address text NOT NULL,
  phone text NOT NULL,
  email text NOT NULL,
  tin text,
  currency_code text NOT NULL DEFAULT 'PHP',
  currency_symbol text NOT NULL DEFAULT '₱',
  timezone text NOT NULL DEFAULT 'Asia/Manila',
  is_setup_completed boolean NOT NULL DEFAULT false,
  setup_step integer NOT NULL DEFAULT 1,
  receipt_footer text NOT NULL DEFAULT 'Thank you for visiting our cafe!',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_mode env_mode NOT NULL DEFAULT 'production',
  code text NOT NULL,
  name text NOT NULL,
  address text NOT NULL,
  phone text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  order_prefix text NOT NULL DEFAULT 'MN',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_mode, code)
);

CREATE TABLE IF NOT EXISTS public.branch_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time time NOT NULL DEFAULT '07:00',
  close_time time NOT NULL DEFAULT '22:00',
  is_closed boolean NOT NULL DEFAULT false,
  UNIQUE (branch_id, day_of_week)
);

CREATE TABLE IF NOT EXISTS public.tax_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_mode env_mode NOT NULL DEFAULT 'production',
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  tax_type tax_type NOT NULL,
  pricing_mode tax_pricing_mode NOT NULL,
  rate_percent numeric(6,3) NOT NULL DEFAULT 0 CHECK (rate_percent >= 0),
  is_exempt boolean NOT NULL DEFAULT false,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.channel_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_mode env_mode NOT NULL DEFAULT 'production',
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  channel order_channel NOT NULL,
  approval_policy channel_approval_policy NOT NULL DEFAULT 'auto_confirm',
  require_payment_before_confirm boolean NOT NULL DEFAULT false,
  UNIQUE (env_mode, branch_id, channel)
);

-- 2. Hybrid RBAC, Invitations, Sessions, Audit Logs
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key staff_role_key NOT NULL,
  module text NOT NULL,
  can_view boolean NOT NULL DEFAULT false,
  can_create boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  can_approve boolean NOT NULL DEFAULT false,
  can_export boolean NOT NULL DEFAULT false,
  UNIQUE (role_key, module)
);

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  env_mode env_mode NOT NULL DEFAULT 'production',
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  role_key staff_role_key NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  session_timeout_minutes integer NOT NULL DEFAULT 480,
  last_active_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_permission_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  module text NOT NULL,
  can_view boolean,
  can_create boolean,
  can_edit boolean,
  can_delete boolean,
  can_approve boolean,
  can_export boolean,
  UNIQUE (user_id, module)
);

CREATE TABLE IF NOT EXISTS public.staff_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_mode env_mode NOT NULL DEFAULT 'production',
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL,
  role_key staff_role_key NOT NULL CHECK (role_key <> 'super_admin'),
  token_hash text NOT NULL UNIQUE,
  invited_by uuid REFERENCES public.user_profiles(id),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  ip_hint text,
  succeeded boolean NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  device_label text NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dashboard_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  widgets jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_mode env_mode NOT NULL DEFAULT 'production',
  branch_id uuid REFERENCES public.branches(id),
  actor_user_id uuid REFERENCES auth.users(id),
  actor_name text NOT NULL,
  action text NOT NULL,
  module text NOT NULL,
  target_id text,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Menu, Modifiers, KDS Stations
CREATE TABLE IF NOT EXISTS public.kds_stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_mode env_mode NOT NULL DEFAULT 'production',
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (env_mode, branch_id, code)
);

CREATE TABLE IF NOT EXISTS public.menu_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_mode env_mode NOT NULL DEFAULT 'production',
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.menu_categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_mode env_mode NOT NULL DEFAULT 'production',
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.menu_categories(id) ON DELETE RESTRICT,
  kds_station_id uuid NOT NULL REFERENCES public.kds_stations(id) ON DELETE RESTRICT,
  sku text NOT NULL,
  barcode text,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  image_url text,
  base_price numeric(12,2) NOT NULL CHECK (base_price >= 0),
  is_featured boolean NOT NULL DEFAULT false,
  is_available boolean NOT NULL DEFAULT true,
  manual_unavailable boolean NOT NULL DEFAULT false,
  unavailable_reason text,
  availability_schedule jsonb,
  tax_profile_id uuid REFERENCES public.tax_profiles(id),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_mode, branch_id, sku)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_unique_barcode
  ON public.products(env_mode, branch_id, barcode)
  WHERE barcode IS NOT NULL AND barcode <> '';

CREATE TABLE IF NOT EXISTS public.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name text NOT NULL,
  price_delta numeric(12,2) NOT NULL DEFAULT 0,
  sku_suffix text,
  is_default boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.modifier_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_mode env_mode NOT NULL DEFAULT 'production',
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  selection_type text NOT NULL CHECK (selection_type IN ('single', 'multiple')),
  is_required boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0
);

-- 4. Ingredients, Recipes, Smart Stock Reservations
CREATE TABLE IF NOT EXISTS public.ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_mode env_mode NOT NULL DEFAULT 'production',
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  category_name text NOT NULL DEFAULT 'General',
  barcode text,
  name text NOT NULL,
  purchase_unit text NOT NULL,
  recipe_unit text NOT NULL,
  conversion_ratio numeric(14,4) NOT NULL DEFAULT 1 CHECK (conversion_ratio > 0),
  current_stock numeric(14,4) NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
  reserved_stock numeric(14,4) NOT NULL DEFAULT 0 CHECK (reserved_stock >= 0),
  reorder_point numeric(14,4) NOT NULL DEFAULT 0 CHECK (reorder_point >= 0),
  unit_cost numeric(12,4) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ingredients_unique_barcode
  ON public.ingredients(env_mode, branch_id, barcode)
  WHERE barcode IS NOT NULL AND barcode <> '';

CREATE TABLE IF NOT EXISTS public.modifier_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.modifier_groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  price_delta numeric(12,2) NOT NULL DEFAULT 0,
  ingredient_id uuid REFERENCES public.ingredients(id) ON DELETE SET NULL,
  ingredient_qty_delta numeric(14,4) DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.product_modifier_groups (
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.modifier_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, group_id)
);

CREATE TABLE IF NOT EXISTS public.recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_mode env_mode NOT NULL DEFAULT 'production',
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE CASCADE,
  instructions text NOT NULL DEFAULT '',
  yield_qty numeric(12,4) NOT NULL DEFAULT 1,
  yield_unit text NOT NULL DEFAULT 'serving',
  waste_factor_percent numeric(6,2) NOT NULL DEFAULT 0 CHECK (waste_factor_percent >= 0),
  UNIQUE (product_id, variant_id)
);

CREATE TABLE IF NOT EXISTS public.recipe_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  quantity numeric(14,4) NOT NULL CHECK (quantity > 0),
  unit text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_mode env_mode NOT NULL DEFAULT 'production',
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  movement_type movement_type NOT NULL,
  quantity_delta numeric(14,4) NOT NULL,
  balance_after numeric(14,4) NOT NULL,
  unit_cost numeric(12,4) NOT NULL DEFAULT 0,
  reference_type text,
  reference_id text,
  reason text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.availability_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_mode env_mode NOT NULL DEFAULT 'production',
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  overridden_by uuid REFERENCES public.user_profiles(id),
  is_available boolean NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Dining Zones, Tables, Shared QR Carts
CREATE TABLE IF NOT EXISTS public.dining_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_mode env_mode NOT NULL DEFAULT 'production',
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.dining_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_mode env_mode NOT NULL DEFAULT 'production',
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES public.dining_zones(id) ON DELETE CASCADE,
  table_number text NOT NULL,
  seats integer NOT NULL DEFAULT 4,
  pos_x integer NOT NULL DEFAULT 40,
  pos_y integer NOT NULL DEFAULT 40,
  width integer NOT NULL DEFAULT 96,
  height integer NOT NULL DEFAULT 96,
  shape text NOT NULL DEFAULT 'square' CHECK (shape IN ('square', 'round', 'rectangle')),
  status table_status NOT NULL DEFAULT 'available',
  qr_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  merged_into_table_id uuid REFERENCES public.dining_tables(id) ON DELETE SET NULL,
  UNIQUE (env_mode, branch_id, table_number)
);

CREATE TABLE IF NOT EXISTS public.table_carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_mode env_mode NOT NULL DEFAULT 'production',
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES public.dining_tables(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (table_id)
);

CREATE TABLE IF NOT EXISTS public.table_cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL REFERENCES public.table_carts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  guest_label text NOT NULL DEFAULT 'Guest',
  quantity integer NOT NULL CHECK (quantity > 0),
  selected_modifiers jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.table_service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_mode env_mode NOT NULL DEFAULT 'production',
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES public.dining_tables(id) ON DELETE CASCADE,
  request_type text NOT NULL CHECK (request_type IN ('call_waiter', 'request_bill')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. Orders, Order Items, Stock Reservations, Payments, Deliveries
CREATE TABLE IF NOT EXISTS public.order_sequences (
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  env_mode env_mode NOT NULL,
  business_date date NOT NULL,
  channel order_channel NOT NULL,
  last_seq integer NOT NULL DEFAULT 0,
  PRIMARY KEY (branch_id, env_mode, business_date, channel)
);

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_mode env_mode NOT NULL DEFAULT 'production',
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  order_number text NOT NULL,
  queue_number text NOT NULL,
  channel order_channel NOT NULL,
  order_type order_type NOT NULL,
  table_id uuid REFERENCES public.dining_tables(id) ON DELETE SET NULL,
  status order_status NOT NULL DEFAULT 'pending',
  payment_status payment_status NOT NULL DEFAULT 'unpaid',
  customer_name text,
  customer_phone text,
  delivery_address text,
  delivery_notes text,
  delivery_fee numeric(12,2) NOT NULL DEFAULT 0,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  discount_total numeric(12,2) NOT NULL DEFAULT 0,
  discount_reason text,
  tax_total numeric(12,2) NOT NULL DEFAULT 0,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  is_priority boolean NOT NULL DEFAULT false,
  order_notes text,
  idempotency_key text NOT NULL UNIQUE,
  tracking_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_by uuid REFERENCES auth.users(id),
  created_by_name text,
  approved_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_mode, branch_id, order_number)
);

CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  kds_station_id uuid NOT NULL REFERENCES public.kds_stations(id) ON DELETE RESTRICT,
  product_name text NOT NULL,
  variant_name text,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  modifiers jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  unit_cost_snapshot numeric(12,4) NOT NULL DEFAULT 0,
  line_total numeric(12,2) NOT NULL CHECK (line_total >= 0),
  kds_status kds_ticket_status NOT NULL DEFAULT 'queued',
  prep_started_at timestamptz,
  prep_ready_at timestamptz,
  assigned_staff_id uuid REFERENCES public.user_profiles(id),
  assigned_staff_name text
);

CREATE TABLE IF NOT EXISTS public.order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  changed_by text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stock_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_mode env_mode NOT NULL DEFAULT 'production',
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  quantity numeric(14,4) NOT NULL CHECK (quantity > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'consumed', 'released')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_mode env_mode NOT NULL DEFAULT 'production',
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  method payment_method NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  reference_number text,
  proof_url text,
  status payment_verification_status NOT NULL DEFAULT 'pending_verification',
  verified_by uuid REFERENCES public.user_profiles(id),
  verified_by_name text,
  verified_at timestamptz,
  rejection_reason text,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_mode env_mode NOT NULL DEFAULT 'production',
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  rider_id uuid REFERENCES public.user_profiles(id),
  rider_name text,
  delivery_status delivery_status NOT NULL DEFAULT 'unassigned',
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  address text NOT NULL,
  landmark text,
  delivery_instructions text,
  delivery_fee numeric(12,2) NOT NULL DEFAULT 0,
  otp_code text,
  proof_photo_url text,
  rider_notes text,
  failed_reason text,
  assigned_at timestamptz,
  delivered_at timestamptz
);

-- 7. Cash Drawers, Shift Reconciliation, Printers, Notifications
CREATE TABLE IF NOT EXISTS public.cash_drawers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_mode env_mode NOT NULL DEFAULT 'production',
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.cash_drawer_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_mode env_mode NOT NULL DEFAULT 'production',
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  drawer_id uuid NOT NULL REFERENCES public.cash_drawers(id) ON DELETE RESTRICT,
  cashier_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
  cashier_name text NOT NULL,
  status shift_status NOT NULL DEFAULT 'open',
  opening_cash numeric(12,2) NOT NULL DEFAULT 0,
  cash_sales_expected numeric(12,2) NOT NULL DEFAULT 0,
  cash_in_total numeric(12,2) NOT NULL DEFAULT 0,
  cash_out_total numeric(12,2) NOT NULL DEFAULT 0,
  expected_cash numeric(12,2) NOT NULL DEFAULT 0,
  actual_cash numeric(12,2),
  variance numeric(12,2),
  denominations jsonb,
  blind_count boolean NOT NULL DEFAULT false,
  approved_by uuid REFERENCES public.user_profiles(id),
  approved_by_name text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  notes text
);

CREATE TABLE IF NOT EXISTS public.cash_drawer_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES public.cash_drawer_shifts(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('cash_in', 'cash_out')),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  reason text NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.printer_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_mode env_mode NOT NULL DEFAULT 'production',
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  target text NOT NULL CHECK (target IN ('receipt', 'kitchen', 'delivery')),
  paper_size text NOT NULL CHECK (paper_size IN ('58mm', '80mm', 'A4', 'Letter')),
  bridge_url text,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.in_app_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_mode env_mode NOT NULL DEFAULT 'production',
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  target_role staff_role_key,
  target_user_id uuid REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  category text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  reference_id text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Public Queue View (STRICTLY NO CUSTOMER PII)
CREATE OR REPLACE VIEW public.public_order_queue AS
SELECT
  o.id,
  o.env_mode,
  o.branch_id,
  o.order_number,
  o.queue_number,
  o.order_type,
  o.status,
  o.updated_at
FROM public.orders o
WHERE o.status IN ('confirmed', 'preparing', 'ready');

-- Seed default role permissions matrix
INSERT INTO public.role_permissions (role_key, module, can_view, can_create, can_edit, can_delete, can_approve, can_export)
VALUES
  ('super_admin', 'dashboard', true, true, true, true, true, true),
  ('super_admin', 'pos', true, true, true, true, true, true),
  ('super_admin', 'orders', true, true, true, true, true, true),
  ('super_admin', 'tables', true, true, true, true, true, true),
  ('super_admin', 'kds', true, true, true, true, true, true),
  ('super_admin', 'menu', true, true, true, true, true, true),
  ('super_admin', 'inventory', true, true, true, true, true, true),
  ('super_admin', 'recipes', true, true, true, true, true, true),
  ('super_admin', 'payments', true, true, true, true, true, true),
  ('super_admin', 'cash_drawer', true, true, true, true, true, true),
  ('super_admin', 'delivery', true, true, true, true, true, true),
  ('super_admin', 'staff', true, true, true, true, true, true),
  ('super_admin', 'settings', true, true, true, true, true, true),
  ('super_admin', 'audit', true, true, true, true, true, true),
  ('manager', 'dashboard', true, false, false, false, false, true),
  ('manager', 'pos', true, true, true, false, true, false),
  ('manager', 'orders', true, true, true, false, true, true),
  ('manager', 'tables', true, true, true, true, false, false),
  ('manager', 'kds', true, false, true, false, false, false),
  ('manager', 'menu', true, true, true, false, true, true),
  ('manager', 'inventory', true, true, true, false, true, true),
  ('manager', 'recipes', true, true, true, false, false, true),
  ('manager', 'payments', true, true, true, false, true, true),
  ('manager', 'cash_drawer', true, true, true, false, true, true),
  ('manager', 'delivery', true, true, true, false, true, false),
  ('manager', 'staff', true, true, true, false, false, false),
  ('manager', 'settings', true, false, true, false, false, false),
  ('manager', 'audit', true, false, false, false, false, true),
  ('cashier', 'dashboard', true, false, false, false, false, false),
  ('cashier', 'pos', true, true, true, false, false, false),
  ('cashier', 'orders', true, true, true, false, false, false),
  ('cashier', 'tables', true, false, true, false, false, false),
  ('cashier', 'kds', true, false, false, false, false, false),
  ('cashier', 'menu', true, false, false, false, false, false),
  ('cashier', 'inventory', true, false, false, false, false, false),
  ('cashier', 'recipes', true, false, false, false, false, false),
  ('cashier', 'payments', true, true, false, false, true, false),
  ('cashier', 'cash_drawer', true, true, true, false, false, false),
  ('cashier', 'delivery', true, true, true, false, false, false),
  ('barista', 'dashboard', true, false, false, false, false, false),
  ('barista', 'orders', true, false, true, false, false, false),
  ('barista', 'tables', true, false, false, false, false, false),
  ('barista', 'kds', true, false, true, false, false, false),
  ('barista', 'menu', true, false, true, false, false, false),
  ('barista', 'inventory', true, false, false, false, false, false),
  ('barista', 'recipes', true, false, false, false, false, false),
  ('rider', 'dashboard', true, false, false, false, false, false),
  ('rider', 'orders', true, false, false, false, false, false),
  ('rider', 'payments', true, true, false, false, false, false),
  ('rider', 'delivery', true, false, true, false, false, false)
ON CONFLICT (role_key, module) DO NOTHING;

-- Enable Realtime on operational tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dining_tables;
ALTER PUBLICATION supabase_realtime ADD TABLE public.table_carts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.table_cart_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.table_service_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.in_app_notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ingredients;
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
