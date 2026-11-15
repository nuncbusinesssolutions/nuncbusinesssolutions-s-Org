import { describe, expect, it } from 'vitest';
import {
  calculateDenominationsTotal,
  calculateOrderTotals,
  calculateRecipeUnitCost,
  checkStockAvailabilityForDemand,
  computeOrderIngredientRequirements,
  deriveOrderStatusFromKdsItems,
  formatOrderNumber,
  hasModulePermission,
  parseCsvText,
} from '../businessLogic';
import {
  demoAdvanceKdsItem,
  demoCancelOrder,
  demoPlaceOrder,
  demoVerifyPayment,
  demoRecordAndVerifyPayment,
  createInitialDemoState,
} from '../../services/demoStore';

describe('Tax & Order Pricing Calculations', () => {
  it('computes 12% VAT tax-inclusive breakdown accurately', () => {
    const res = calculateOrderTotals({
      itemsSubtotal: 224,
      discountAmount: 0,
      deliveryFee: 0,
      taxProfile: { taxType: 'vat', pricingMode: 'inclusive', ratePercent: 12, isExempt: false },
    });
    expect(res.taxableNet).toBe(200);
    expect(res.taxTotal).toBe(24);
    expect(res.totalAmount).toBe(224);
  });

  it('computes VAT tax-exclusive breakdown and adds delivery fee separately', () => {
    const res = calculateOrderTotals({
      itemsSubtotal: 200,
      discountAmount: 0,
      deliveryFee: 65,
      taxProfile: { taxType: 'vat', pricingMode: 'exclusive', ratePercent: 12, isExempt: false },
    });
    expect(res.taxTotal).toBe(24);
    expect(res.totalAmount).toBe(289);
  });

  it('computes Non-VAT / exempt orders with zero tax', () => {
    const res = calculateOrderTotals({
      itemsSubtotal: 350,
      discountAmount: 50,
      deliveryFee: 0,
      taxProfile: { taxType: 'non_vat', pricingMode: 'inclusive', ratePercent: 12, isExempt: true },
    });
    expect(res.taxTotal).toBe(0);
    expect(res.totalAmount).toBe(300);
  });
});

describe('Smart Stock Reservation & Consumption Lifecycle', () => {
  it('reserves on confirmation, consumes on prep start, and never auto-restores consumed stock on cancel', () => {
    const initial = createInitialDemoState();
    const beansBefore = initial.ingredients.find((i) => i.id === 'ing_beans')!;
    const startAvail = beansBefore.currentStock - beansBefore.reservedStock;

    // 1. Place & confirm order for 2x Spanish Cortado Latte (18g * 1.02 waste * 2 = 36.72g)
    const { state: s1, order } = demoPlaceOrder(initial, {
      channel: 'pos',
      orderType: 'takeout',
      idempotencyKey: 'test_idem_1',
      actorName: 'Test Cashier',
      items: [
        {
          productId: 'prd_spanish',
          variantId: 'var_sp_reg',
          quantity: 2,
          unitPrice: 175,
          modifiers: [],
        },
      ],
    });
    const beansAfterConfirm = s1.ingredients.find((i) => i.id === 'ing_beans')!;
    expect(beansAfterConfirm.currentStock).toBe(beansBefore.currentStock);
    expect(beansAfterConfirm.reservedStock).toBeGreaterThan(beansBefore.reservedStock);

    // 2. Start prep on KDS -> consumes reserved stock from currentStock & reservedStock
    const s2 = demoAdvanceKdsItem(s1, order.id, order.items[0].id, 'preparing', 'Test Barista');
    const beansAfterPrep = s2.ingredients.find((i) => i.id === 'ing_beans')!;
    expect(beansAfterPrep.currentStock).toBeLessThan(beansBefore.currentStock);
    expect(beansAfterPrep.currentStock - beansAfterPrep.reservedStock).toBeLessThan(startAvail);

    // 3. Cancel order after prep started -> consumed stock MUST NOT be restored
    const s3 = demoCancelOrder(s2, order.id, 'Customer changed mind', 'Manager');
    const beansAfterCancel = s3.ingredients.find((i) => i.id === 'ing_beans')!;
    expect(beansAfterCancel.currentStock).toBe(beansAfterPrep.currentStock);
  });

  it('releases active reservations when cancelled BEFORE preparation starts', () => {
    const initial = createInitialDemoState();
    const beansBefore = initial.ingredients.find((i) => i.id === 'ing_beans')!;
    const { state: s1, order } = demoPlaceOrder(initial, {
      channel: 'pos',
      orderType: 'takeout',
      idempotencyKey: 'test_idem_2',
      actorName: 'Test Cashier',
      items: [
        { productId: 'prd_spanish', quantity: 1, unitPrice: 175, modifiers: [] },
      ],
    });
    const s2 = demoCancelOrder(s1, order.id, 'Entered wrong item', 'Cashier');
    const beansAfter = s2.ingredients.find((i) => i.id === 'ing_beans')!;
    expect(beansAfter.reservedStock).toBe(beansBefore.reservedStock);
    expect(beansAfter.currentStock).toBe(beansBefore.currentStock);
  });
});

describe('Multi-Station KDS Readiness Rollup', () => {
  it('does not mark order ready until ALL active items across stations are ready', () => {
    expect(
      deriveOrderStatusFromKdsItems('confirmed', [{ kdsStatus: 'ready' }, { kdsStatus: 'preparing' }])
    ).toBe('preparing');
    expect(
      deriveOrderStatusFromKdsItems('preparing', [{ kdsStatus: 'ready' }, { kdsStatus: 'ready' }])
    ).toBe('ready');
  });
});

describe('Payments, RBAC, Denominations, Order Numbers, & CSV', () => {
  it('keeps GCash payment pending verification until staff verifies', () => {
    const initial = createInitialDemoState();
    const { state: s1, order } = demoPlaceOrder(initial, {
      channel: 'qr_table',
      orderType: 'dine_in',
      idempotencyKey: 'test_idem_pay',
      actorName: 'Guest',
      items: [{ productId: 'prd_croissant', quantity: 1, unitPrice: 145, modifiers: [] }],
    });
    const s2 = demoRecordAndVerifyPayment(s1, {
      orderId: order.id,
      method: 'gcash',
      amount: order.totalAmount,
      referenceNumber: 'GCASH-998811',
      actorName: 'Guest',
      idempotencyKey: 'pay_test_1',
    });
    expect(s2.orders.find((o) => o.id === order.id)?.paymentStatus).toBe('pending_verification');

    const payment = s2.payments[0];
    const s3 = demoVerifyPayment(s2, payment.id, true, 'Clarisse Reyes');
    expect(s3.orders.find((o) => o.id === order.id)?.paymentStatus).toBe('paid');
  });

  it('enforces hybrid RBAC overrides over role templates', () => {
    const initial = createInitialDemoState();
    const cashier = { ...initial.users.find((u) => u.roleKey === 'cashier')! };
    expect(hasModulePermission(cashier, 'settings', 'edit')).toBe(false);
    cashier.customPermissions = { settings: { view: true, create: false, edit: true, delete: false, approve: false, export: false } };
    expect(hasModulePermission(cashier, 'settings', 'edit')).toBe(true);
  });

  it('computes PHP denominations accurately and formats channel order numbers', () => {
    expect(calculateDenominationsTotal({ '1000': 2, '500': 1, '20': 3, '0.25': 4 })).toBe(2561);
    const num = formatOrderNumber({ branchPrefix: 'MN', channel: 'qr_table', dateKey: '2026-11-14', seq: 7 });
    expect(num.orderNumber).toBe('MN-QR-261114-0007');
    expect(num.queueNumber).toBe('Q-007');
  });

  it('computes recipe costing, stock check, and CSV parsing', () => {
    const initial = createInitialDemoState();
    const cost = calculateRecipeUnitCost(initial.recipes[0], initial.ingredients);
    expect(cost).toBeGreaterThan(0);

    const demand = computeOrderIngredientRequirements(
      [{ productId: 'prd_matcha', quantity: 100 }],
      initial.recipes
    );
    const check = checkStockAvailabilityForDemand(demand, initial.ingredients);
    expect(check.ok).toBe(false);

    const parsed = parseCsvText('name,sku,price\nFlat White,ESP-002,160');
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].sku).toBe('ESP-002');
  });
});
