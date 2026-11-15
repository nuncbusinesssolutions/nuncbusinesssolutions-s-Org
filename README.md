# KapeOS — Production Cafe Management System (Phase 1)

A single-business, multi-branch-ready Cafe Management System built with **React + TypeScript + Vite + Tailwind CSS** and **Supabase** (PostgreSQL, Auth, Row Level Security, Realtime, Storage, Edge Functions).

---

## 1. Environment Variables & Secrets

Copy `.env.example` to `.env` for local development or configure in **Vercel Project Settings → Environment Variables**:

```bash
VITE_SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
VITE_SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_KEY"
```

- **Security Rule**: Never place `SUPABASE_SERVICE_ROLE_KEY` in `VITE_*` frontend environment variables. The service-role key is used strictly inside Supabase Edge Functions (`supabase/functions/`).

---

## 2. Supabase Setup Guide

1. Create a new project in [Supabase](https://supabase.com).
2. Run the SQL migrations in order via Supabase CLI (`supabase db push`) or the Supabase SQL Editor:
   - `supabase/migrations/0001_phase1_core_schema.sql`
   - `supabase/migrations/0002_phase1_rls_and_rpcs.sql`
   - `supabase/migrations/0003_storage_buckets.sql`
   - `supabase/migrations/0004_phase1_payment_cancel_shift_rpcs.sql`
   - `supabase/migrations/0005_phase1_audit_hardening.sql`
   - `supabase/migrations/0006_phase1_operational_rpcs.sql`
   - `supabase/migrations/0007_phase1_staging_readiness.sql`
3. Deploy Edge Functions (with `supabase/config.toml` setting `verify_jwt = false` on bootstrap/invite endpoints and `SUPABASE_SERVICE_ROLE_KEY` provided in Edge Runtime):
   - `supabase functions deploy setup-initial-owner --no-verify-jwt`
   - `supabase functions deploy invite-staff --no-verify-jwt`
4. Configure **Authentication → Sign In / Providers** in Supabase Dashboard:
   - Disable public email self-signup (`Allow new users to sign up` = OFF).
   - Set **Site URL** to your Staging Vercel URL and add wildcard redirect URLs (`https://your-staging-url.vercel.app/**`).
   - Configure custom SMTP (e.g., Resend / Postmark / SendGrid) for reliable staff invitation emails.
5. Complete the one-time Super Admin owner bootstrap and guided 14-step Onboarding Wizard (`/setup`).

---

## 3. Vercel Deployment & Backup Responsibilities

### Vercel Frontend Hosting
1. Import this repository into **Vercel**.
2. Framework Preset: **Vite** (`npm run build`, output directory `dist`).
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel Environment Variables.
4. `vercel.json` configures SPA routing rewrites (`/(.*) -> /index.html`) for client-side routes.

### Supabase Backup & Disaster Recovery
- **PostgreSQL Daily Backups / PITR**: Handled by Supabase platform infrastructure. Supabase **Pro** (daily automated backups + optional Point-in-Time Recovery add-on) is recommended before live cafe launch; Free tier does not provide automated backups or PITR.
- **Storage Buckets**: `cafe-assets` and `payment-proofs` objects are not covered by `pg_dump`; configure object replication or periodic bucket sync externally if long-term archival of GCash/Maya proof images is required for BIR compliance.
- **Auth Rate Limiting**: Configure Supabase Auth rate limits and SMTP provider in Supabase Dashboard before inviting production staff.

---

## 4. Demo vs. Production Isolation

- **Demo Mode**: Isolated in `sessionStorage` (`env_mode: 'demo'`) with sample Philippine specialty cafe data (`PHP ₱`, `Asia/Manila`) and a role switcher (`Super Admin`, `Manager`, `Cashier`, `Barista`, `Delivery Rider`). Demo records never touch Production tables.
- **Production Mode**: Connects strictly to your Supabase project. If Supabase environment variables are missing, Production mode displays the connection requirement instead of simulating fake backend calls.

---

## 5. Printing & Hardware Compatibility Notes

- **Browser Printing**: Supports `58mm`, `80mm`, `A4`, and `Letter` templates for Customer Receipts, Kitchen Tickets, and Delivery Slips. Standard browser printing prompts user confirmation.
- **Silent Automatic Thermal Printing**: Browser sandboxes cannot silently print without confirmation. Silent ESC/POS printing requires running a compatible local print-bridge service on the POS terminal and configuring its URL in Settings.
- **Barcode Scanners**: Compatible with USB and Bluetooth barcode scanners operating in HID keyboard-wedge mode (focused scan input in POS & Inventory).

---

## 6. CSV Import Templates (Onboarding Wizard)

- **Products CSV**: `name,sku,price,barcode,description`
- **Ingredients CSV**: `name,category,barcode,purchase_unit,recipe_unit,conversion_ratio,opening_stock,reorder_point,unit_cost`

---

## 7. Running Tests & Verification

```bash
npm run lint
npm run test
npm run build
```
