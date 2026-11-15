import { SupabaseClient } from '@supabase/supabase-js';
import { DemoState } from './demoStore';
import {
  AppModule,
  AuditLog,
  Branch,
  BranchHour,
  BusinessSettings,
  CashDrawer,
  CashDrawerShift,
  ChannelPolicy,
  DeliveryRecord,
  DiningTable,
  DiningZone,
  InAppNotification,
  Ingredient,
  InventoryMovement,
  KdsStation,
  MenuCategory,
  ModifierGroup,
  Order,
  PaymentRecord,
  PrinterConfig,
  Product,
  Recipe,
  RolePermissionsMap,
  StaffInvitation,
  StockReservation,
  TableServiceRequest,
  TaxProfile,
  UserProfile,
} from '../types/cafe';

export function createEmptyProductionState(): DemoState {
  return {
    business: {
      id: '',
      envMode: 'production',
      businessName: 'Cafe Setup Required',
      address: '',
      phone: '',
      email: '',
      currencyCode: 'PHP',
      currencySymbol: '₱',
      timezone: 'Asia/Manila',
      isSetupCompleted: false,
      setupStep: 1,
      receiptFooter: 'Thank you for visiting!',
    },
    branch: {
      id: '',
      envMode: 'production',
      code: 'MAIN',
      name: 'Primary Branch',
      address: '',
      phone: '',
      isPrimary: true,
      isActive: true,
      orderPrefix: 'MN',
    },
    branchHours: [],
    taxProfiles: [
      {
        id: 'default-pending',
        envMode: 'production',
        branchId: '',
        name: 'Unconfigured Tax Profile',
        taxType: 'non_vat',
        pricingMode: 'inclusive',
        ratePercent: 0,
        isExempt: true,
        isDefault: true,
      },
    ],
    channelPolicies: [],
    users: [],
    invitations: [],
    kdsStations: [],
    categories: [],
    modifierGroups: [],
    ingredients: [],
    products: [],
    recipes: [],
    movements: [],
    reservations: [],
    zones: [],
    tables: [],
    tableCarts: {},
    serviceRequests: [],
    orders: [],
    payments: [],
    deliveries: [],
    cashDrawers: [],
    shifts: [],
    printers: [],
    notifications: [],
    auditLogs: [],
    sequences: {},
  };
}

export async function loadUserPermissionOverrides(
  sb: SupabaseClient,
  userId: string
): Promise<Partial<RolePermissionsMap>> {
  const { data } = await sb
    .from('user_permission_overrides')
    .select('*')
    .eq('user_id', userId);

  const map: Partial<RolePermissionsMap> = {};
  for (const row of data ?? []) {
    const mod = row.module as AppModule;
    map[mod] = {
      view: Boolean(row.can_view),
      create: Boolean(row.can_create),
      edit: Boolean(row.can_edit),
      delete: Boolean(row.can_delete),
      approve: Boolean(row.can_approve),
      export: Boolean(row.can_export),
    };
  }
  return map;
}

export async function fetchProductionSnapshot(
  sb: SupabaseClient,
  currentUser: UserProfile | null
): Promise<DemoState> {
  const base = createEmptyProductionState();

  const [bizRes, branchRes] = await Promise.all([
    sb.from('business_settings').select('*').eq('env_mode', 'production').limit(1).maybeSingle(),
    currentUser?.branchId
      ? sb.from('branches').select('*').eq('id', currentUser.branchId).maybeSingle()
      : sb.from('branches').select('*').eq('env_mode', 'production').eq('is_primary', true).limit(1).maybeSingle(),
  ]);

  if (bizRes.error) throw bizRes.error;
  if (branchRes.error) throw branchRes.error;

  const business: BusinessSettings = bizRes.data
    ? {
        id: bizRes.data.id,
        envMode: 'production',
        businessName: bizRes.data.business_name,
        logoUrl: bizRes.data.logo_url ?? undefined,
        address: bizRes.data.address,
        phone: bizRes.data.phone,
        email: bizRes.data.email,
        tin: bizRes.data.tin ?? undefined,
        currencyCode: bizRes.data.currency_code,
        currencySymbol: bizRes.data.currency_symbol,
        timezone: bizRes.data.timezone,
        isSetupCompleted: bizRes.data.is_setup_completed,
        setupStep: bizRes.data.setup_step,
        receiptFooter: bizRes.data.receipt_footer,
      }
    : base.business;

  const branch: Branch = branchRes.data
    ? {
        id: branchRes.data.id,
        envMode: 'production',
        code: branchRes.data.code,
        name: branchRes.data.name,
        address: branchRes.data.address,
        phone: branchRes.data.phone,
        isPrimary: branchRes.data.is_primary,
        isActive: branchRes.data.is_active,
        orderPrefix: branchRes.data.order_prefix,
      }
    : base.branch;

  if (!branch.id) {
    return { ...base, business, branch };
  }

  const branchId = branch.id;

  // Public catalog queries (work for both anonymous QR/Kiosk and authenticated staff)
  const [
    hoursRes,
    catsRes,
    prodsRes,
    varsRes,
    modGroupsRes,
    modOptsRes,
    prodModsRes,
    zonesRes,
    policiesRes,
  ] = await Promise.all([
    sb.from('branch_hours').select('*').eq('branch_id', branchId).order('day_of_week'),
    sb.from('menu_categories').select('*').eq('env_mode', 'production').eq('branch_id', branchId).order('sort_order'),
    sb.from('products').select('*').eq('env_mode', 'production').eq('branch_id', branchId).order('sort_order'),
    sb.from('product_variants').select('*'),
    sb.from('modifier_groups').select('*').eq('env_mode', 'production').eq('branch_id', branchId).order('sort_order'),
    sb.from('modifier_options').select('*').order('sort_order'),
    sb.from('product_modifier_groups').select('*'),
    sb.from('dining_zones').select('*').eq('env_mode', 'production').eq('branch_id', branchId).order('sort_order'),
    sb.from('channel_policies').select('*').eq('env_mode', 'production').eq('branch_id', branchId),
  ]);

  const branchHours: BranchHour[] = (hoursRes.data ?? []).map((h) => ({
    id: h.id,
    branchId: h.branch_id,
    dayOfWeek: h.day_of_week,
    openTime: String(h.open_time).slice(0, 5),
    closeTime: String(h.close_time).slice(0, 5),
    isClosed: h.is_closed,
  }));

  const categories: MenuCategory[] = (catsRes.data ?? []).map((c) => ({
    id: c.id,
    envMode: 'production',
    branchId: c.branch_id,
    parentId: c.parent_id ?? undefined,
    name: c.name,
    sortOrder: c.sort_order,
    isActive: c.is_active,
  }));

  const modifierGroups: ModifierGroup[] = (modGroupsRes.data ?? []).map((g) => ({
    id: g.id,
    envMode: 'production',
    branchId: g.branch_id,
    name: g.name,
    selectionType: g.selection_type,
    isRequired: g.is_required,
    options: (modOptsRes.data ?? [])
      .filter((o) => o.group_id === g.id)
      .map((o) => ({
        id: o.id,
        groupId: o.group_id,
        name: o.name,
        priceDelta: Number(o.price_delta),
        ingredientId: o.ingredient_id ?? undefined,
        ingredientQtyDelta: o.ingredient_qty_delta ? Number(o.ingredient_qty_delta) : undefined,
        sortOrder: o.sort_order,
      })),
  }));

  const products: Product[] = (prodsRes.data ?? []).map((p) => ({
    id: p.id,
    envMode: 'production',
    branchId: p.branch_id,
    categoryId: p.category_id,
    kdsStationId: p.kds_station_id,
    sku: p.sku,
    barcode: p.barcode ?? undefined,
    name: p.name,
    description: p.description,
    imageUrl: p.image_url ?? undefined,
    basePrice: Number(p.base_price),
    isFeatured: p.is_featured,
    isAvailable: p.is_available,
    manualUnavailable: p.manual_unavailable,
    unavailableReason: p.unavailable_reason ?? undefined,
    taxProfileId: p.tax_profile_id ?? undefined,
    variants: (varsRes.data ?? [])
      .filter((v) => v.product_id === p.id)
      .map((v) => ({
        id: v.id,
        productId: v.product_id,
        name: v.name,
        priceDelta: Number(v.price_delta),
        skuSuffix: v.sku_suffix ?? undefined,
        isDefault: v.is_default,
      })),
    modifierGroupIds: (prodModsRes.data ?? [])
      .filter((pm) => pm.product_id === p.id)
      .map((pm) => pm.group_id),
  }));

  const zones: DiningZone[] = (zonesRes.data ?? []).map((z) => ({
    id: z.id,
    envMode: 'production',
    branchId: z.branch_id,
    name: z.name,
    sortOrder: z.sort_order,
  }));

  const channelPolicies: ChannelPolicy[] = (policiesRes.data ?? []).map((c) => ({
    id: c.id,
    envMode: 'production',
    branchId: c.branch_id,
    channel: c.channel,
    approvalPolicy: c.approval_policy,
    requirePaymentBeforeConfirm: c.require_payment_before_confirm,
  }));

  // If no authenticated staff member, return strictly public storefront catalog (zero staff/table QR/customer PII!)
  if (!currentUser) {
    return {
      ...base,
      business,
      branch,
      branchHours,
      categories,
      modifierGroups,
      products,
      zones,
      tables: [],
      channelPolicies,
    };
  }

  // Authenticated staff data (RLS-filtered server-side by user permissions + branch_id + env_mode)
  const [
    taxRes,
    kdsRes,
    ingRes,
    recRes,
    recItemsRes,
    movRes,
    resvRes,
    reqRes,
    ordersRes,
    orderItemsRes,
    paymentsRes,
    delRes,
    drawersRes,
    shiftsRes,
    shiftMovRes,
    printersRes,
    notifRes,
    usersRes,
    overridesRes,
    tablesRes,
    invRes,
    auditRes,
  ] = await Promise.all([
    sb.from('tax_profiles').select('*').eq('env_mode', 'production').eq('branch_id', branchId),
    sb.from('kds_stations').select('*').eq('env_mode', 'production').eq('branch_id', branchId).order('sort_order'),
    sb.from('ingredients').select('*').eq('env_mode', 'production').eq('branch_id', branchId).order('name'),
    sb.from('recipes').select('*').eq('env_mode', 'production').eq('branch_id', branchId),
    sb.from('recipe_items').select('*'),
    sb.from('inventory_movements').select('*').eq('env_mode', 'production').eq('branch_id', branchId).order('created_at', { ascending: false }).limit(200),
    sb.from('stock_reservations').select('*').eq('env_mode', 'production').eq('branch_id', branchId).eq('status', 'active'),
    sb.from('table_service_requests').select('*').eq('env_mode', 'production').eq('branch_id', branchId).order('created_at', { ascending: false }),
    sb.from('orders').select('*').eq('env_mode', 'production').eq('branch_id', branchId).order('created_at', { ascending: false }).limit(200),
    sb.from('order_items').select('*'),
    sb.from('payments').select('*').eq('env_mode', 'production').eq('branch_id', branchId).order('created_at', { ascending: false }).limit(200),
    sb.from('deliveries').select('*').eq('env_mode', 'production').eq('branch_id', branchId),
    sb.from('cash_drawers').select('*').eq('env_mode', 'production').eq('branch_id', branchId),
    sb.from('cash_drawer_shifts').select('*').eq('env_mode', 'production').eq('branch_id', branchId).order('opened_at', { ascending: false }).limit(50),
    sb.from('cash_drawer_movements').select('*').order('created_at', { ascending: false }),
    sb.from('printer_configs').select('*').eq('env_mode', 'production').eq('branch_id', branchId),
    sb.from('in_app_notifications').select('*').eq('env_mode', 'production').eq('branch_id', branchId).order('created_at', { ascending: false }).limit(50),
    sb.from('user_profiles').select('*').eq('env_mode', 'production').eq('branch_id', branchId),
    sb.from('user_permission_overrides').select('*'),
    sb.from('dining_tables').select('*').eq('env_mode', 'production').eq('branch_id', branchId),
    sb.from('staff_invitations').select('*').eq('env_mode', 'production').eq('branch_id', branchId).order('created_at', { ascending: false }),
    sb.from('audit_logs').select('*').eq('env_mode', 'production').order('created_at', { ascending: false }).limit(100),
  ]);

  const tables: DiningTable[] = (tablesRes.data ?? []).map((t) => ({
    id: t.id,
    envMode: 'production',
    branchId: t.branch_id,
    zoneId: t.zone_id,
    tableNumber: t.table_number,
    seats: t.seats,
    posX: t.pos_x,
    posY: t.pos_y,
    width: t.width,
    height: t.height,
    shape: t.shape,
    status: t.status,
    qrToken: t.qr_token,
    mergedIntoTableId: t.merged_into_table_id ?? undefined,
  }));

  const taxProfiles: TaxProfile[] =
    (taxRes.data ?? []).length > 0
      ? (taxRes.data ?? []).map((t) => ({
          id: t.id,
          envMode: 'production',
          branchId: t.branch_id,
          name: t.name,
          taxType: t.tax_type,
          pricingMode: t.pricing_mode,
          ratePercent: Number(t.rate_percent),
          isExempt: t.is_exempt,
          isDefault: t.is_default,
        }))
      : base.taxProfiles;

  const kdsStations: KdsStation[] = (kdsRes.data ?? []).map((k) => ({
    id: k.id,
    envMode: 'production',
    branchId: k.branch_id,
    name: k.name,
    code: k.code,
    sortOrder: k.sort_order,
    isActive: k.is_active,
  }));

  const ingredients: Ingredient[] = (ingRes.data ?? []).map((i) => ({
    id: i.id,
    envMode: 'production',
    branchId: i.branch_id,
    categoryName: i.category_name,
    barcode: i.barcode ?? undefined,
    name: i.name,
    purchaseUnit: i.purchase_unit,
    recipeUnit: i.recipe_unit,
    conversionRatio: Number(i.conversion_ratio),
    currentStock: Number(i.current_stock),
    reservedStock: Number(i.reserved_stock),
    reorderPoint: Number(i.reorder_point),
    unitCost: Number(i.unit_cost),
    isActive: i.is_active,
  }));

  const recipes: Recipe[] = (recRes.data ?? []).map((r) => ({
    id: r.id,
    envMode: 'production',
    branchId: r.branch_id,
    productId: r.product_id,
    variantId: r.variant_id ?? undefined,
    instructions: r.instructions,
    yieldQty: Number(r.yield_qty),
    yieldUnit: r.yield_unit,
    wasteFactorPercent: Number(r.waste_factor_percent),
    items: (recItemsRes.data ?? [])
      .filter((ri) => ri.recipe_id === r.id)
      .map((ri) => ({
        id: ri.id,
        recipeId: ri.recipe_id,
        ingredientId: ri.ingredient_id,
        quantity: Number(ri.quantity),
        unit: ri.unit,
      })),
  }));

  const movements: InventoryMovement[] = (movRes.data ?? []).map((m) => ({
    id: m.id,
    envMode: 'production',
    branchId: m.branch_id,
    ingredientId: m.ingredient_id,
    movementType: m.movement_type,
    quantityDelta: Number(m.quantity_delta),
    balanceAfter: Number(m.balance_after),
    unitCost: Number(m.unit_cost),
    referenceType: m.reference_type ?? undefined,
    referenceId: m.reference_id ?? undefined,
    reason: m.reason ?? undefined,
    createdBy: m.created_by,
    createdAt: m.created_at,
  }));

  const reservations: StockReservation[] = (resvRes.data ?? []).map((r) => ({
    id: r.id,
    envMode: 'production',
    branchId: r.branch_id,
    orderId: r.order_id,
    ingredientId: r.ingredient_id,
    quantity: Number(r.quantity),
    status: r.status,
    createdAt: r.created_at,
  }));

  const serviceRequests: TableServiceRequest[] = (reqRes.data ?? []).map((sr) => ({
    id: sr.id,
    envMode: 'production',
    branchId: sr.branch_id,
    tableId: sr.table_id,
    requestType: sr.request_type,
    status: sr.status,
    notes: sr.notes ?? undefined,
    createdAt: sr.created_at,
  }));

  const orders: Order[] = (ordersRes.data ?? []).map((o) => ({
    id: o.id,
    envMode: 'production',
    branchId: o.branch_id,
    orderNumber: o.order_number,
    queueNumber: o.queue_number,
    channel: o.channel,
    orderType: o.order_type,
    tableId: o.table_id ?? undefined,
    status: o.status,
    paymentStatus: o.payment_status,
    customerName: o.customer_name ?? undefined,
    customerPhone: o.customer_phone ?? undefined,
    deliveryAddress: o.delivery_address ?? undefined,
    deliveryNotes: o.delivery_notes ?? undefined,
    deliveryFee: Number(o.delivery_fee),
    subtotal: Number(o.subtotal),
    discountTotal: Number(o.discount_total),
    discountReason: o.discount_reason ?? undefined,
    taxTotal: Number(o.tax_total),
    totalAmount: Number(o.total_amount),
    isPriority: o.is_priority,
    orderNotes: o.order_notes ?? undefined,
    idempotencyKey: o.idempotency_key,
    trackingToken: o.tracking_token,
    createdByName: o.created_by_name ?? undefined,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
    items: (orderItemsRes.data ?? [])
      .filter((oi) => oi.order_id === o.id)
      .map((oi) => ({
        id: oi.id,
        orderId: oi.order_id,
        productId: oi.product_id,
        variantId: oi.variant_id ?? undefined,
        kdsStationId: oi.kds_station_id,
        productName: oi.product_name,
        variantName: oi.variant_name ?? undefined,
        quantity: oi.quantity,
        unitPrice: Number(oi.unit_price),
        modifiers: Array.isArray(oi.modifiers) ? oi.modifiers : [],
        notes: oi.notes ?? undefined,
        unitCostSnapshot: Number(oi.unit_cost_snapshot),
        lineTotal: Number(oi.line_total),
        kdsStatus: oi.kds_status,
        prepStartedAt: oi.prep_started_at ?? undefined,
        prepReadyAt: oi.prep_ready_at ?? undefined,
        assignedStaffName: oi.assigned_staff_name ?? undefined,
      })),
  }));

  const payments: PaymentRecord[] = (paymentsRes.data ?? []).map((p) => ({
    id: p.id,
    envMode: 'production',
    branchId: p.branch_id,
    orderId: p.order_id,
    method: p.method,
    amount: Number(p.amount),
    referenceNumber: p.reference_number ?? undefined,
    proofUrl: p.proof_url ?? undefined,
    status: p.status,
    verifiedByName: p.verified_by_name ?? undefined,
    verifiedAt: p.verified_at ?? undefined,
    rejectionReason: p.rejection_reason ?? undefined,
    idempotencyKey: p.idempotency_key,
    createdAt: p.created_at,
  }));

  const deliveries: DeliveryRecord[] = (delRes.data ?? []).map((d) => ({
    id: d.id,
    envMode: 'production',
    branchId: d.branch_id,
    orderId: d.order_id,
    riderId: d.rider_id ?? undefined,
    riderName: d.rider_name ?? undefined,
    deliveryStatus: d.delivery_status,
    customerName: d.customer_name,
    customerPhone: d.customer_phone,
    address: d.address,
    landmark: d.landmark ?? undefined,
    deliveryInstructions: d.delivery_instructions ?? undefined,
    deliveryFee: Number(d.delivery_fee),
    otpCode: d.otp_code ?? undefined,
    riderNotes: d.rider_notes ?? undefined,
    failedReason: d.failed_reason ?? undefined,
    assignedAt: d.assigned_at ?? undefined,
    deliveredAt: d.delivered_at ?? undefined,
  }));

  const cashDrawers: CashDrawer[] = (drawersRes.data ?? []).map((dr) => ({
    id: dr.id,
    envMode: 'production',
    branchId: dr.branch_id,
    name: dr.name,
    isActive: dr.is_active,
  }));

  const shifts: CashDrawerShift[] = (shiftsRes.data ?? []).map((s) => ({
    id: s.id,
    envMode: 'production',
    branchId: s.branch_id,
    drawerId: s.drawer_id,
    cashierId: s.cashier_id,
    cashierName: s.cashier_name,
    status: s.status,
    openingCash: Number(s.opening_cash),
    cashSalesExpected: Number(s.cash_sales_expected),
    cashInTotal: Number(s.cash_in_total),
    cashOutTotal: Number(s.cash_out_total),
    expectedCash: Number(s.expected_cash),
    actualCash: s.actual_cash !== null && s.actual_cash !== undefined ? Number(s.actual_cash) : undefined,
    variance: s.variance !== null && s.variance !== undefined ? Number(s.variance) : undefined,
    denominations: s.denominations ?? undefined,
    blindCount: s.blind_count,
    approvedByName: s.approved_by_name ?? undefined,
    openedAt: s.opened_at,
    closedAt: s.closed_at ?? undefined,
    notes: s.notes ?? undefined,
    movements: (shiftMovRes.data ?? [])
      .filter((m) => m.shift_id === s.id)
      .map((m) => ({
        id: m.id,
        shiftId: m.shift_id,
        type: m.type,
        amount: Number(m.amount),
        reason: m.reason,
        createdBy: m.created_by,
        createdAt: m.created_at,
      })),
  }));

  const printers: PrinterConfig[] = (printersRes.data ?? []).map((pr) => ({
    id: pr.id,
    envMode: 'production',
    branchId: pr.branch_id,
    name: pr.name,
    target: pr.target,
    paperSize: pr.paper_size,
    bridgeUrl: pr.bridge_url ?? undefined,
    isDefault: pr.is_default,
    isActive: pr.is_active,
  }));

  const notifications: InAppNotification[] = (notifRes.data ?? []).map((n) => ({
    id: n.id,
    envMode: 'production',
    branchId: n.branch_id,
    targetRole: n.target_role ?? undefined,
    category: n.category,
    title: n.title,
    message: n.message,
    referenceId: n.reference_id ?? undefined,
    isRead: n.is_read,
    createdAt: n.created_at,
  }));

  const users: UserProfile[] = (usersRes.data ?? []).map((u) => {
    const customPermissions: Partial<RolePermissionsMap> = {};
    for (const row of (overridesRes.data ?? []).filter((ov) => ov.user_id === u.id)) {
      customPermissions[row.module as AppModule] = {
        view: Boolean(row.can_view),
        create: Boolean(row.can_create),
        edit: Boolean(row.can_edit),
        delete: Boolean(row.can_delete),
        approve: Boolean(row.can_approve),
        export: Boolean(row.can_export),
      };
    }
    return {
      id: u.id,
      envMode: 'production',
      branchId: u.branch_id,
      fullName: u.full_name,
      email: u.email,
      phone: u.phone ?? undefined,
      roleKey: u.role_key,
      isActive: u.is_active,
      sessionTimeoutMinutes: u.session_timeout_minutes,
      customPermissions,
    };
  });

  const invitations: StaffInvitation[] = (invRes.data ?? []).map((inv) => ({
    id: inv.id,
    envMode: 'production',
    branchId: inv.branch_id,
    email: inv.email,
    fullName: inv.full_name,
    roleKey: inv.role_key,
    inviteCode: inv.token_hash.slice(0, 8),
    expiresAt: inv.expires_at,
    acceptedAt: inv.accepted_at ?? undefined,
  }));

  const auditLogs: AuditLog[] = (auditRes.data ?? []).map((a) => ({
    id: a.id,
    envMode: 'production',
    branchId: a.branch_id ?? branchId,
    actorUserId: a.actor_user_id ?? undefined,
    actorName: a.actor_name,
    action: a.action,
    module: a.module as AppModule,
    targetId: a.target_id ?? undefined,
    reason: a.reason ?? undefined,
    metadata: a.metadata ?? undefined,
    createdAt: a.created_at,
  }));

  return {
    ...base,
    business,
    branch,
    branchHours,
    taxProfiles,
    channelPolicies,
    users,
    invitations,
    kdsStations,
    categories,
    modifierGroups,
    ingredients,
    products,
    recipes,
    movements,
    reservations,
    zones,
    tables,
    serviceRequests,
    orders,
    payments,
    deliveries,
    cashDrawers,
    shifts,
    printers,
    notifications,
    auditLogs,
  };
}

export function subscribeProductionRealtime(
  sb: SupabaseClient,
  branchId: string,
  onSyncNeeded: () => void
): () => void {
  const channel = sb
    .channel(`kapeos-prod-${branchId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, onSyncNeeded)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, onSyncNeeded)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ingredients' }, onSyncNeeded)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, onSyncNeeded)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, onSyncNeeded)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'dining_tables' }, onSyncNeeded)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'table_service_requests' }, onSyncNeeded)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, onSyncNeeded)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_drawer_shifts' }, onSyncNeeded)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'in_app_notifications' }, onSyncNeeded)
    .subscribe();

  return () => {
    sb.removeChannel(channel);
  };
}
