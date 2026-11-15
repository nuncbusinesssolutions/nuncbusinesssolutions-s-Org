import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createInitialDemoState,
  demoCloseShift,
  demoConfirmPendingOrder,
  demoPlaceOrder,
  demoRecordAndVerifyPayment,
  demoRefundPayment,
  demoUpdateDeliveryStatus,
} from '../../services/demoStore';
import { createEmptyProductionState } from '../../services/productionService';
import { ALL_MODULES, hasModulePermission } from '../businessLogic';
import { StaffRoleKey } from '../../types/cafe';

describe('Audit: Transactional Workflows, Idempotency & Business Logic', () => {
  it('reserves ingredients when approving a pending online order and blocks approval on stock shortage', () => {
    const base = createInitialDemoState();
    // 'online' defaults to staff_approval -> pending
    const beansBefore = base.ingredients.find((i) => i.id === 'ing_beans')!;
    const { state: s1, order } = demoPlaceOrder(base, {
      channel: 'online',
      orderType: 'takeout',
      customerName: 'Online Guest',
      idempotencyKey: 'audit_pending_1',
      actorName: 'Online Guest',
      items: [{ productId: 'prd_spanish', variantId: 'var_sp_reg', quantity: 2, unitPrice: 175, modifiers: [] }],
    });

    expect(order.status).toBe('pending');
    // Not yet reserved while pending
    expect(s1.ingredients.find((i) => i.id === 'ing_beans')!.reservedStock).toBe(beansBefore.reservedStock);

    // Approving reserves stock atomically
    const s2 = demoConfirmPendingOrder(s1, order.id, 'Clarisse Reyes');
    expect(s2.orders.find((o) => o.id === order.id)?.status).toBe('confirmed');
    expect(s2.ingredients.find((i) => i.id === 'ing_beans')!.reservedStock).toBeGreaterThan(beansBefore.reservedStock);

    // Deplete stock on a second pending order -> approval MUST reject shortage
    const { state: s3, order: order2 } = demoPlaceOrder(s1, {
      channel: 'online',
      orderType: 'takeout',
      customerName: 'Second Guest',
      idempotencyKey: 'audit_pending_2',
      actorName: 'Second Guest',
      items: [{ productId: 'prd_matcha', quantity: 10, unitPrice: 195, modifiers: [] }],
    });
    s3.ingredients.find((i) => i.id === 'ing_matcha')!.currentStock = 5; // less than 40g needed
    expect(() => demoConfirmPendingOrder(s3, order2.id, 'Clarisse Reyes')).toThrow(/Insufficient stock/i);
  });

  it('prevents duplicate order creation and double stock reservation on repeated idempotency key', () => {
    const base = createInitialDemoState();
    const payload = {
      channel: 'pos' as const,
      orderType: 'takeout' as const,
      idempotencyKey: 'dup_order_key_123',
      actorName: 'Paolo Mendoza',
      items: [{ productId: 'prd_spanish', quantity: 1, unitPrice: 175, modifiers: [] }],
    };

    const first = demoPlaceOrder(base, payload);
    const reservedAfterFirst = first.state.ingredients.find((i) => i.id === 'ing_beans')!.reservedStock;

    const second = demoPlaceOrder(first.state, payload);
    expect(second.order.id).toBe(first.order.id);
    expect(second.state.orders.length).toBe(first.state.orders.length);
    expect(second.state.ingredients.find((i) => i.id === 'ing_beans')!.reservedStock).toBe(reservedAfterFirst);
  });

  it('prevents duplicate payment submission and supports full/partial refunds with shift cash adjustment', () => {
    const base = createInitialDemoState();
    const { state: s1, order } = demoPlaceOrder(base, {
      channel: 'pos',
      orderType: 'takeout',
      idempotencyKey: 'audit_pay_ord_1',
      actorName: 'Paolo Mendoza',
      items: [{ productId: 'prd_spanish', quantity: 2, unitPrice: 175, modifiers: [] }], // 350
    });

    const shiftBefore = s1.shifts.find((s) => s.status === 'open')!.cashSalesExpected;

    const payParams = {
      orderId: order.id,
      method: 'cash' as const,
      amount: 200,
      actorName: 'Paolo Mendoza',
      idempotencyKey: 'dup_pay_key_1',
    };
    const s2 = demoRecordAndVerifyPayment(s1, payParams);
    const s2Dup = demoRecordAndVerifyPayment(s2, payParams);
    expect(s2Dup.payments.length).toBe(s2.payments.length);

    // Partial payment keeps order pending_verification; second payment settles in full
    const s3 = demoRecordAndVerifyPayment(s2Dup, {
      orderId: order.id,
      method: 'cash',
      amount: 150,
      actorName: 'Paolo Mendoza',
      idempotencyKey: 'dup_pay_key_2',
    });
    expect(s3.orders.find((o) => o.id === order.id)?.paymentStatus).toBe('paid');
    expect(s3.shifts.find((s) => s.status === 'open')!.cashSalesExpected).toBe(shiftBefore + 350);

    // Refund requires non-empty reason
    const firstPayment = s3.payments.find((p) => p.idempotencyKey === 'dup_pay_key_1')!;
    expect(() => demoRefundPayment(s3, firstPayment.id, 'Clarisse Reyes', '   ')).toThrow(/reason/i);

    // Partial refund marks order partially_refunded and reduces open shift cashSalesExpected
    const s4 = demoRefundPayment(s3, firstPayment.id, 'Clarisse Reyes', 'Overcharge adjustment');
    expect(s4.orders.find((o) => o.id === order.id)?.paymentStatus).toBe('partially_refunded');
    expect(s4.shifts.find((s) => s.status === 'open')!.cashSalesExpected).toBe(shiftBefore + 150);

    // Duplicate refund is idempotent
    const s4Dup = demoRefundPayment(s4, firstPayment.id, 'Clarisse Reyes', 'Retry');
    expect(s4Dup.shifts.find((s) => s.status === 'open')!.cashSalesExpected).toBe(shiftBefore + 150);
  });

  it('enforces delivery OTP verification and mandatory failure reason', () => {
    const base = createInitialDemoState();
    const { state: s1 } = demoPlaceOrder(base, {
      channel: 'pos',
      orderType: 'delivery',
      customerName: 'Bianca Cruz',
      customerPhone: '+63 917 888 1234',
      deliveryAddress: 'Ayala Ave, Makati',
      deliveryFee: 65,
      idempotencyKey: 'audit_del_1',
      actorName: 'Cashier',
      items: [{ productId: 'prd_croissant', quantity: 1, unitPrice: 145, modifiers: [] }],
    });

    const del = s1.deliveries[0];
    expect(del.otpCode).toMatch(/^\d{4}$/);

    // Wrong OTP must fail
    expect(() =>
      demoUpdateDeliveryStatus(s1, del.id, 'delivered', 'Jeric Navarro', '0000', 'Left at lobby')
    ).toThrow(/OTP/i);

    // Failed without reason must throw
    expect(() =>
      demoUpdateDeliveryStatus(s1, del.id, 'failed', 'Jeric Navarro', undefined, '')
    ).toThrow(/reason/i);

    // Valid OTP completes delivery & parent order
    const s2 = demoUpdateDeliveryStatus(s1, del.id, 'delivered', 'Jeric Navarro', del.otpCode, 'Handed to recipient');
    expect(s2.deliveries[0].deliveryStatus).toBe('delivered');
    expect(s2.orders.find((o) => o.id === del.orderId)?.status).toBe('completed');
  });

  it('flags large cash drawer variance (> ₱50) as pending_approval', () => {
    const base = createInitialDemoState();
    const openShift = base.shifts.find((s) => s.status === 'open')!;
    // expectedCash is 5320; counting 5000 gives -320 variance -> pending_approval
    const s1 = demoCloseShift(base, openShift.id, { '1000': 5 }, 'Paolo Mendoza', 'Short count');
    const closed = s1.shifts.find((s) => s.id === openShift.id)!;
    expect(closed.actualCash).toBe(5000);
    expect(closed.variance).toBe(-320);
    expect(closed.status).toBe('pending_approval');
  });
});

describe('Audit: RBAC Role Matrix & Production Isolation', () => {
  it('enforces least-privilege defaults across all 5 roles and disables inactive users', () => {
    const base = createInitialDemoState();
    const byRole = (role: StaffRoleKey) => base.users.find((u) => u.roleKey === role)!;

    // Super admin has all permissions
    for (const mod of ALL_MODULES) {
      expect(hasModulePermission(byRole('super_admin'), mod, 'approve')).toBe(true);
    }
    // Barista cannot access payments, cash_drawer, or staff
    expect(hasModulePermission(byRole('barista'), 'kds', 'edit')).toBe(true);
    expect(hasModulePermission(byRole('barista'), 'payments', 'view')).toBe(false);
    expect(hasModulePermission(byRole('barista'), 'cash_drawer', 'view')).toBe(false);
    expect(hasModulePermission(byRole('barista'), 'staff', 'view')).toBe(false);

    // Rider cannot edit menu or settings
    expect(hasModulePermission(byRole('rider'), 'delivery', 'edit')).toBe(true);
    expect(hasModulePermission(byRole('rider'), 'menu', 'edit')).toBe(false);
    expect(hasModulePermission(byRole('rider'), 'settings', 'edit')).toBe(false);

    // Inactive staff loses all permissions even if super_admin
    const inactiveOwner = { ...byRole('super_admin'), isActive: false };
    expect(hasModulePermission(inactiveOwner, 'pos', 'create')).toBe(false);
  });

  it('keeps clean production baseline strictly free of demo seed data', () => {
    const prod = createEmptyProductionState();
    expect(prod.business.envMode).toBe('production');
    expect(prod.products).toHaveLength(0);
    expect(prod.ingredients).toHaveLength(0);
    expect(prod.orders).toHaveLength(0);
    expect(prod.users).toHaveLength(0);
  });
});

describe('Audit: Static SQL Security, Frontend Secret Leak & Deployment Checks', () => {
  const rootDir = process.cwd();
  const migrationsDir = path.join(rootDir, 'supabase', 'migrations');
  const migrationFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  const allSql = migrationFiles.map((f) => fs.readFileSync(path.join(migrationsDir, f), 'utf8')).join('\n');

  it('enables RLS on every table created in 0001_phase1_core_schema.sql', () => {
    const schemaSql = fs.readFileSync(path.join(migrationsDir, '0001_phase1_core_schema.sql'), 'utf8');
    const createdTables = [...schemaSql.matchAll(/CREATE TABLE IF NOT EXISTS public\.([a-z0-9_]+)/gi)].map(
      (m) => m[1]
    );
    expect(createdTables.length).toBeGreaterThan(30);
    for (const tbl of createdTables) {
      expect(allSql).toMatch(new RegExp(`ALTER TABLE public\\.${tbl} ENABLE ROW LEVEL SECURITY`, 'i'));
    }
  });

  it('sets search_path = public on every SECURITY DEFINER function', () => {
    const blocks = allSql.split(/CREATE OR REPLACE FUNCTION /i).slice(1);
    expect(blocks.length).toBeGreaterThan(10);
    for (const block of blocks) {
      if (/SECURITY DEFINER/i.test(block)) {
        expect(block).toMatch(/SET search_path\s*=\s*public/i);
      }
    }
  });

  it('never leaks Supabase service-role credentials or secrets into frontend src/', () => {
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
      });

    const srcFiles = walk(path.join(rootDir, 'src')).filter((f) => !f.endsWith('auditWorkflows.test.ts'));
    for (const file of srcFiles) {
      const content = fs.readFileSync(file, 'utf8');
      expect(content).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/i);
      expect(content).not.toMatch(/VITE_SUPABASE_SERVICE_ROLE/i);
    }
  });

  it('configures Vercel SPA rewrite in vercel.json and avoids unbundled /src/assets/ string paths', () => {
    const vercelPath = path.join(rootDir, 'vercel.json');
    expect(fs.existsSync(vercelPath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(vercelPath, 'utf8'));
    expect(parsed.rewrites?.some((r: { destination: string }) => r.destination === '/index.html')).toBe(true);

    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
      });
    const srcFiles = walk(path.join(rootDir, 'src')).filter((f) => !f.endsWith('auditWorkflows.test.ts'));
    for (const file of srcFiles) {
      expect(fs.readFileSync(file, 'utf8')).not.toMatch(/['"`]\/src\/assets\//);
    }
  });

  it('restricts permission override management to super_admin in 0006 migration', () => {
    const m6 = fs.readFileSync(path.join(migrationsDir, '0006_phase1_operational_rpcs.sql'), 'utf8');
    expect(m6).toMatch(/CREATE OR REPLACE FUNCTION public\.is_super_admin\(\)/i);
    expect(m6).toMatch(/CREATE POLICY "admin_manage_overrides"[\s\S]*public\.is_super_admin\(\)/i);
    expect(m6).toMatch(/DROP POLICY IF EXISTS "qr_insert_service_requests"/i);
  });

  it('includes 0007 staging readiness fixes and supabase/config.toml', () => {
    const m7 = fs.readFileSync(path.join(migrationsDir, '0007_phase1_staging_readiness.sql'), 'utf8');
    expect(m7).toMatch(/ALTER PUBLICATION supabase_realtime ADD TABLE public\.payments/i);
    expect(m7).toMatch(/ALTER PUBLICATION supabase_realtime ADD TABLE public\.deliveries/i);
    expect(m7).toMatch(/ALTER PUBLICATION supabase_realtime ADD TABLE public\.cash_drawer_shifts/i);
    expect(m7).toMatch(/DROP POLICY IF EXISTS "read_tables" ON public\.dining_tables/i);
    expect(m7).toMatch(/CREATE OR REPLACE FUNCTION public\.complete_order_transactional/i);
    expect(m7).toMatch(/gen_random_uuid\(\)/i);

    const cfg = fs.readFileSync(path.join(rootDir, 'supabase', 'config.toml'), 'utf8');
    expect(cfg).toMatch(/enable_signup\s*=\s*false/);
    expect(cfg).toMatch(/\[functions\.setup-initial-owner\]/);
  });
});


