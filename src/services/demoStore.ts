import {
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
  KdsTicketStatus,
  MenuCategory,
  ModifierGroup,
  Order,
  OrderChannel,
  OrderItem,
  OrderType,
  PaymentMethod,
  PaymentRecord,
  PrinterConfig,
  Product,
  Recipe,
  SelectedModifier,
  StaffInvitation,
  StaffRoleKey,
  StockReservation,
  TableCartItem,
  TableServiceRequest,
  TaxProfile,
  UserProfile,
} from '../types/cafe';
import {
  calculateDenominationsTotal,
  calculateOrderTotals,
  calculateRecipeUnitCost,
  checkStockAvailabilityForDemand,
  computeOrderIngredientRequirements,
  deriveOrderStatusFromKdsItems,
  formatManilaDateKey,
  formatOrderNumber,
  isProductPreparable,
  round2,
} from '../lib/businessLogic';
import espressoLatteImg from '../assets/images/cafe_espresso_latte_1794642355739.jpg';
import icedMatchaImg from '../assets/images/cafe_iced_matcha_1794642354565.jpg';
import coldBrewImg from '../assets/images/cafe_cold_brew_1794642355231.jpg';
import croissantPastryImg from '../assets/images/cafe_croissant_pastry_1794642355441.jpg';

export interface DemoState {
  business: BusinessSettings;
  branch: Branch;
  branchHours: BranchHour[];
  taxProfiles: TaxProfile[];
  channelPolicies: ChannelPolicy[];
  users: UserProfile[];
  invitations: StaffInvitation[];
  kdsStations: KdsStation[];
  categories: MenuCategory[];
  modifierGroups: ModifierGroup[];
  ingredients: Ingredient[];
  products: Product[];
  recipes: Recipe[];
  movements: InventoryMovement[];
  reservations: StockReservation[];
  zones: DiningZone[];
  tables: DiningTable[];
  tableCarts: Record<string, TableCartItem[]>;
  serviceRequests: TableServiceRequest[];
  orders: Order[];
  payments: PaymentRecord[];
  deliveries: DeliveryRecord[];
  cashDrawers: CashDrawer[];
  shifts: CashDrawerShift[];
  printers: PrinterConfig[];
  notifications: InAppNotification[];
  auditLogs: AuditLog[];
  sequences: Record<string, number>;
}

const DEMO_STORAGE_KEY = 'kapeos_isolated_demo_state_v1';

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createInitialDemoState(): DemoState {
  const branchId = 'branch_demo_main';
  const now = new Date().toISOString();

  const users: UserProfile[] = [
    {
      id: 'usr_owner',
      envMode: 'demo',
      branchId,
      fullName: 'Marco Santos',
      email: 'owner@tala.coffee.ph',
      phone: '+63 917 555 0101',
      roleKey: 'super_admin',
      isActive: true,
      sessionTimeoutMinutes: 480,
    },
    {
      id: 'usr_manager',
      envMode: 'demo',
      branchId,
      fullName: 'Clarisse Reyes',
      email: 'manager@tala.coffee.ph',
      phone: '+63 917 555 0102',
      roleKey: 'manager',
      isActive: true,
      sessionTimeoutMinutes: 480,
    },
    {
      id: 'usr_cashier',
      envMode: 'demo',
      branchId,
      fullName: 'Paolo Mendoza',
      email: 'cashier@tala.coffee.ph',
      phone: '+63 917 555 0103',
      roleKey: 'cashier',
      isActive: true,
      sessionTimeoutMinutes: 240,
    },
    {
      id: 'usr_barista',
      envMode: 'demo',
      branchId,
      fullName: 'Aika Villanueva',
      email: 'barista@tala.coffee.ph',
      phone: '+63 917 555 0104',
      roleKey: 'barista',
      isActive: true,
      sessionTimeoutMinutes: 240,
    },
    {
      id: 'usr_rider',
      envMode: 'demo',
      branchId,
      fullName: 'Jeric Navarro',
      email: 'rider@tala.coffee.ph',
      phone: '+63 917 555 0105',
      roleKey: 'rider',
      isActive: true,
      sessionTimeoutMinutes: 240,
    },
  ];

  const kdsStations: KdsStation[] = [
    { id: 'stn_barista', envMode: 'demo', branchId, name: 'Espresso & Cold Bar', code: 'BAR', sortOrder: 1, isActive: true },
    { id: 'stn_kitchen', envMode: 'demo', branchId, name: 'Bakery & Warm Kitchen', code: 'KIT', sortOrder: 2, isActive: true },
  ];

  const categories: MenuCategory[] = [
    { id: 'cat_espresso', envMode: 'demo', branchId, name: 'Espresso & Milk', sortOrder: 1, isActive: true },
    { id: 'cat_matcha', envMode: 'demo', branchId, name: 'Matcha & Tea', sortOrder: 2, isActive: true },
    { id: 'cat_coldbrew', envMode: 'demo', branchId, name: 'Cold Brew & Filter', sortOrder: 3, isActive: true },
    { id: 'cat_bakery', envMode: 'demo', branchId, name: 'Artisanal Pastries', sortOrder: 4, isActive: true },
  ];

  const ingredients: Ingredient[] = [
    {
      id: 'ing_beans',
      envMode: 'demo',
      branchId,
      categoryName: 'Coffee Beans',
      barcode: '480001001001',
      name: 'Single-Origin Espresso Roast',
      purchaseUnit: 'kg',
      recipeUnit: 'g',
      conversionRatio: 1000,
      currentStock: 4200,
      reservedStock: 18,
      reorderPoint: 1500,
      unitCost: 1.35,
      isActive: true,
    },
    {
      id: 'ing_milk',
      envMode: 'demo',
      branchId,
      categoryName: 'Dairy',
      barcode: '480001001002',
      name: 'Full Cream Barista Milk',
      purchaseUnit: 'L',
      recipeUnit: 'ml',
      conversionRatio: 1000,
      currentStock: 14500,
      reservedStock: 180,
      reorderPoint: 4000,
      unitCost: 0.11,
      isActive: true,
    },
    {
      id: 'ing_oatmilk',
      envMode: 'demo',
      branchId,
      categoryName: 'Alt Milk',
      barcode: '480001001003',
      name: 'Barista Oat Milk',
      purchaseUnit: 'L',
      recipeUnit: 'ml',
      conversionRatio: 1000,
      currentStock: 3200,
      reservedStock: 0,
      reorderPoint: 2000,
      unitCost: 0.21,
      isActive: true,
    },
    {
      id: 'ing_condensed',
      envMode: 'demo',
      branchId,
      categoryName: 'Sweeteners',
      barcode: '480001001004',
      name: 'Sweetened Condensed Milk',
      purchaseUnit: 'can',
      recipeUnit: 'ml',
      conversionRatio: 300,
      currentStock: 2400,
      reservedStock: 30,
      reorderPoint: 600,
      unitCost: 0.24,
      isActive: true,
    },
    {
      id: 'ing_matcha',
      envMode: 'demo',
      branchId,
      categoryName: 'Tea & Powder',
      barcode: '480001001005',
      name: 'Uji Ceremonial Matcha',
      purchaseUnit: 'tin',
      recipeUnit: 'g',
      conversionRatio: 100,
      currentStock: 180,
      reservedStock: 0,
      reorderPoint: 200, // deliberately low-stock alert example!
      unitCost: 6.5,
      isActive: true,
    },
    {
      id: 'ing_coldbrew',
      envMode: 'demo',
      branchId,
      categoryName: 'Brewed Base',
      barcode: '480001001006',
      name: '18-Hr Cold Brew Concentrate',
      purchaseUnit: 'L',
      recipeUnit: 'ml',
      conversionRatio: 1000,
      currentStock: 6000,
      reservedStock: 0,
      reorderPoint: 1500,
      unitCost: 0.16,
      isActive: true,
    },
    {
      id: 'ing_croissant',
      envMode: 'demo',
      branchId,
      categoryName: 'Bakery',
      barcode: '480001001007',
      name: 'French Butter Croissant (Baked)',
      purchaseUnit: 'box',
      recipeUnit: 'pcs',
      conversionRatio: 12,
      currentStock: 18,
      reservedStock: 1,
      reorderPoint: 6,
      unitCost: 58,
      isActive: true,
    },
  ];

  const modifierGroups: ModifierGroup[] = [
    {
      id: 'mod_temp',
      envMode: 'demo',
      branchId,
      name: 'Temperature',
      selectionType: 'single',
      isRequired: true,
      options: [
        { id: 'opt_hot', groupId: 'mod_temp', name: 'Hot', priceDelta: 0, sortOrder: 1 },
        { id: 'opt_iced', groupId: 'mod_temp', name: 'Iced', priceDelta: 15, sortOrder: 2 },
      ],
    },
    {
      id: 'mod_sugar',
      envMode: 'demo',
      branchId,
      name: 'Sweetness Level',
      selectionType: 'single',
      isRequired: false,
      options: [
        { id: 'opt_sug_100', groupId: 'mod_sugar', name: '100% Regular', priceDelta: 0, sortOrder: 1 },
        { id: 'opt_sug_50', groupId: 'mod_sugar', name: '50% Less Sweet', priceDelta: 0, sortOrder: 2 },
        { id: 'opt_sug_0', groupId: 'mod_sugar', name: '0% Unsweetened', priceDelta: 0, sortOrder: 3 },
      ],
    },
    {
      id: 'mod_milk',
      envMode: 'demo',
      branchId,
      name: 'Milk Upgrade',
      selectionType: 'single',
      isRequired: false,
      options: [
        { id: 'opt_dairy', groupId: 'mod_milk', name: 'Full Cream Dairy', priceDelta: 0, sortOrder: 1 },
        { id: 'opt_oat', groupId: 'mod_milk', name: 'Oat Milk', priceDelta: 45, ingredientId: 'ing_oatmilk', ingredientQtyDelta: 180, sortOrder: 2 },
      ],
    },
    {
      id: 'mod_addons',
      envMode: 'demo',
      branchId,
      name: 'Barista Add-ons',
      selectionType: 'multiple',
      isRequired: false,
      options: [
        { id: 'opt_shot', groupId: 'mod_addons', name: 'Extra Espresso Shot', priceDelta: 45, ingredientId: 'ing_beans', ingredientQtyDelta: 18, sortOrder: 1 },
      ],
    },
  ];

  const products: Product[] = [
    {
      id: 'prd_spanish',
      envMode: 'demo',
      branchId,
      categoryId: 'cat_espresso',
      kdsStationId: 'stn_barista',
      sku: 'ESP-001',
      barcode: '4809001001',
      name: 'Spanish Cortado Latte',
      description: 'Double ristretto pulled over textured full-cream milk and house condensed milk reduction.',
      imageUrl: espressoLatteImg,
      basePrice: 175,
      isFeatured: true,
      isAvailable: true,
      manualUnavailable: false,
      variants: [
        { id: 'var_sp_reg', productId: 'prd_spanish', name: 'Regular 12oz', priceDelta: 0, isDefault: true },
        { id: 'var_sp_lrg', productId: 'prd_spanish', name: 'Large 16oz', priceDelta: 30, isDefault: false },
      ],
      modifierGroupIds: ['mod_temp', 'mod_sugar', 'mod_milk', 'mod_addons'],
    },
    {
      id: 'prd_matcha',
      envMode: 'demo',
      branchId,
      categoryId: 'cat_matcha',
      kdsStationId: 'stn_barista',
      sku: 'MAT-001',
      barcode: '4809001002',
      name: 'Ceremonial Uji Matcha',
      description: 'Stone-ground first-harvest Uji matcha hand-whisked to order over silky milk.',
      imageUrl: icedMatchaImg,
      basePrice: 195,
      isFeatured: true,
      isAvailable: true,
      manualUnavailable: false,
      variants: [
        { id: 'var_mat_reg', productId: 'prd_matcha', name: 'Regular 12oz', priceDelta: 0, isDefault: true },
        { id: 'var_mat_lrg', productId: 'prd_matcha', name: 'Large 16oz', priceDelta: 35, isDefault: false },
      ],
      modifierGroupIds: ['mod_temp', 'mod_sugar', 'mod_milk'],
    },
    {
      id: 'prd_coldbrew',
      envMode: 'demo',
      branchId,
      categoryId: 'cat_coldbrew',
      kdsStationId: 'stn_barista',
      sku: 'CLD-001',
      barcode: '4809001003',
      name: 'Velvet Cream Cold Brew',
      description: '18-hour cold-steeped Benguet & Colombia blend topped with lightly salted sweet cream.',
      imageUrl: coldBrewImg,
      basePrice: 180,
      isFeatured: false,
      isAvailable: true,
      manualUnavailable: false,
      variants: [
        { id: 'var_cb_reg', productId: 'prd_coldbrew', name: '12oz Fluted Glass', priceDelta: 0, isDefault: true },
        { id: 'var_cb_lrg', productId: 'prd_coldbrew', name: '16oz Tall', priceDelta: 30, isDefault: false },
      ],
      modifierGroupIds: ['mod_sugar', 'mod_addons'],
    },
    {
      id: 'prd_croissant',
      envMode: 'demo',
      branchId,
      categoryId: 'cat_bakery',
      kdsStationId: 'stn_kitchen',
      sku: 'BAK-001',
      barcode: '4809001004',
      name: 'French Butter Croissant',
      description: '27-layer laminated cultured butter pastry baked golden each morning, warmed to serve.',
      imageUrl: croissantPastryImg,
      basePrice: 145,
      isFeatured: true,
      isAvailable: true,
      manualUnavailable: false,
      variants: [
        { id: 'var_cr_plain', productId: 'prd_croissant', name: 'Warm Butter', priceDelta: 0, isDefault: true },
        { id: 'var_cr_jam', productId: 'prd_croissant', name: 'With House Berry Jam', priceDelta: 25, isDefault: false },
      ],
      modifierGroupIds: [],
    },
  ];

  const recipes: Recipe[] = [
    {
      id: 'rec_spanish',
      envMode: 'demo',
      branchId,
      productId: 'prd_spanish',
      instructions: 'Pull 18g double espresso (36ml), stir 30ml condensed milk, top with 180ml steamed/iced milk.',
      yieldQty: 1,
      yieldUnit: 'cup',
      wasteFactorPercent: 2,
      items: [
        { id: 'ri_1', recipeId: 'rec_spanish', ingredientId: 'ing_beans', quantity: 18, unit: 'g' },
        { id: 'ri_2', recipeId: 'rec_spanish', ingredientId: 'ing_milk', quantity: 180, unit: 'ml' },
        { id: 'ri_3', recipeId: 'rec_spanish', ingredientId: 'ing_condensed', quantity: 30, unit: 'ml' },
      ],
    },
    {
      id: 'rec_matcha',
      envMode: 'demo',
      branchId,
      productId: 'prd_matcha',
      instructions: 'Whisk 4g Uji matcha with 40ml 75C water, pour over 180ml chilled or steamed milk.',
      yieldQty: 1,
      yieldUnit: 'cup',
      wasteFactorPercent: 2,
      items: [
        { id: 'ri_4', recipeId: 'rec_matcha', ingredientId: 'ing_matcha', quantity: 4, unit: 'g' },
        { id: 'ri_5', recipeId: 'rec_matcha', ingredientId: 'ing_milk', quantity: 180, unit: 'ml' },
      ],
    },
    {
      id: 'rec_coldbrew',
      envMode: 'demo',
      branchId,
      productId: 'prd_coldbrew',
      instructions: 'Pour 160ml concentrate over crystal ice, top with 40ml cream float.',
      yieldQty: 1,
      yieldUnit: 'cup',
      wasteFactorPercent: 1,
      items: [
        { id: 'ri_6', recipeId: 'rec_coldbrew', ingredientId: 'ing_coldbrew', quantity: 160, unit: 'ml' },
        { id: 'ri_7', recipeId: 'rec_coldbrew', ingredientId: 'ing_milk', quantity: 40, unit: 'ml' },
      ],
    },
    {
      id: 'rec_croissant',
      envMode: 'demo',
      branchId,
      productId: 'prd_croissant',
      instructions: 'Warm at 175C for 3 minutes until flaky crust crisps.',
      yieldQty: 1,
      yieldUnit: 'pcs',
      wasteFactorPercent: 0,
      items: [
        { id: 'ri_8', recipeId: 'rec_croissant', ingredientId: 'ing_croissant', quantity: 1, unit: 'pcs' },
      ],
    },
  ];

  const zones: DiningZone[] = [
    { id: 'zone_main', envMode: 'demo', branchId, name: 'Main Sunlit Hall', sortOrder: 1 },
    { id: 'zone_patio', envMode: 'demo', branchId, name: 'Garden Patio', sortOrder: 2 },
  ];

  const tables: DiningTable[] = [
    { id: 'tbl_1', envMode: 'demo', branchId, zoneId: 'zone_main', tableNumber: 'T-01', seats: 2, posX: 32, posY: 36, width: 96, height: 96, shape: 'square', status: 'occupied', qrToken: 'demo-table-1' },
    { id: 'tbl_2', envMode: 'demo', branchId, zoneId: 'zone_main', tableNumber: 'T-02', seats: 2, posX: 164, posY: 36, width: 96, height: 96, shape: 'square', status: 'available', qrToken: 'demo-table-2' },
    { id: 'tbl_3', envMode: 'demo', branchId, zoneId: 'zone_main', tableNumber: 'T-03', seats: 4, posX: 296, posY: 36, width: 128, height: 96, shape: 'rectangle', status: 'available', qrToken: 'demo-table-3' },
    { id: 'tbl_4', envMode: 'demo', branchId, zoneId: 'zone_main', tableNumber: 'T-04', seats: 6, posX: 32, posY: 168, width: 144, height: 100, shape: 'rectangle', status: 'reserved', qrToken: 'demo-table-4' },
    { id: 'tbl_5', envMode: 'demo', branchId, zoneId: 'zone_patio', tableNumber: 'P-01', seats: 4, posX: 216, posY: 168, width: 104, height: 104, shape: 'round', status: 'available', qrToken: 'demo-table-5' },
  ];

  const dateKey = formatManilaDateKey();
  const sampleOrderId = 'ord_demo_1';
  const sampleOrder: Order = {
    id: sampleOrderId,
    envMode: 'demo',
    branchId,
    orderNumber: `MN-POS-${dateKey.replace(/-/g, '').slice(2)}-0001`,
    queueNumber: 'P-001',
    channel: 'pos',
    orderType: 'dine_in',
    tableId: 'tbl_1',
    status: 'confirmed',
    paymentStatus: 'paid',
    customerName: 'Table T-01 Guest',
    deliveryFee: 0,
    subtotal: 320,
    discountTotal: 0,
    taxTotal: 34.29,
    totalAmount: 320,
    isPriority: false,
    idempotencyKey: 'demo_seed_1',
    trackingToken: 'track-demo-1',
    createdByName: 'Paolo Mendoza',
    createdAt: now,
    updatedAt: now,
    items: [
      {
        id: 'oi_demo_1',
        orderId: sampleOrderId,
        productId: 'prd_spanish',
        variantId: 'var_sp_reg',
        kdsStationId: 'stn_barista',
        productName: 'Spanish Cortado Latte',
        variantName: 'Regular 12oz',
        quantity: 1,
        unitPrice: 175,
        modifiers: [{ groupId: 'mod_temp', groupName: 'Temperature', optionId: 'opt_hot', optionName: 'Hot', priceDelta: 0 }],
        unitCostSnapshot: 52.32,
        lineTotal: 175,
        kdsStatus: 'queued',
      },
      {
        id: 'oi_demo_2',
        orderId: sampleOrderId,
        productId: 'prd_croissant',
        variantId: 'var_cr_plain',
        kdsStationId: 'stn_kitchen',
        productName: 'French Butter Croissant',
        variantName: 'Warm Butter',
        quantity: 1,
        unitPrice: 145,
        modifiers: [],
        unitCostSnapshot: 58,
        lineTotal: 145,
        kdsStatus: 'queued',
      },
    ],
  };

  return {
    business: {
      id: 'biz_demo',
      envMode: 'demo',
      businessName: 'Tala Specialty Coffee',
      address: '142 Esteban St., Legazpi Village, Makati City',
      phone: '+63 2 8555 0198',
      email: 'hello@tala.coffee.ph',
      tin: '009-412-882-000',
      currencyCode: 'PHP',
      currencySymbol: '₱',
      timezone: 'Asia/Manila',
      isSetupCompleted: true,
      setupStep: 14,
      receiptFooter: 'Salamat! Brewed fresh in Legazpi Village.',
    },
    branch: {
      id: branchId,
      envMode: 'demo',
      code: 'MAIN',
      name: 'Legazpi Village Flagship',
      address: '142 Esteban St., Legazpi Village, Makati City',
      phone: '+63 2 8555 0198',
      isPrimary: true,
      isActive: true,
      orderPrefix: 'MN',
    },
    branchHours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
      id: `bh_${day}`,
      branchId,
      dayOfWeek: day,
      openTime: '07:00',
      closeTime: '21:00',
      isClosed: false,
    })),
    taxProfiles: [
      {
        id: 'tax_vat_inc',
        envMode: 'demo',
        branchId,
        name: '12% VAT (Tax-Inclusive)',
        taxType: 'vat',
        pricingMode: 'inclusive',
        ratePercent: 12,
        isExempt: false,
        isDefault: true,
      },
      {
        id: 'tax_nonvat',
        envMode: 'demo',
        branchId,
        name: 'Non-VAT / Percentage Tax Exempt',
        taxType: 'non_vat',
        pricingMode: 'inclusive',
        ratePercent: 0,
        isExempt: true,
        isDefault: false,
      },
    ],
    channelPolicies: [
      { id: 'pol_pos', envMode: 'demo', branchId, channel: 'pos', approvalPolicy: 'auto_confirm', requirePaymentBeforeConfirm: false },
      { id: 'pol_qr', envMode: 'demo', branchId, channel: 'qr_table', approvalPolicy: 'auto_confirm', requirePaymentBeforeConfirm: false },
      { id: 'pol_ksk', envMode: 'demo', branchId, channel: 'kiosk', approvalPolicy: 'auto_with_exception', requirePaymentBeforeConfirm: true },
      { id: 'pol_onl', envMode: 'demo', branchId, channel: 'online', approvalPolicy: 'staff_approval', requirePaymentBeforeConfirm: false },
    ],
    users,
    invitations: [],
    kdsStations,
    categories,
    modifierGroups,
    ingredients,
    products,
    recipes,
    movements: [
      {
        id: 'mov_1',
        envMode: 'demo',
        branchId,
        ingredientId: 'ing_beans',
        movementType: 'stock_in',
        quantityDelta: 4200,
        balanceAfter: 4200,
        unitCost: 1.35,
        reason: 'Opening inventory count',
        createdBy: 'Marco Santos',
        createdAt: now,
      },
    ],
    reservations: [
      { id: 'res_1', envMode: 'demo', branchId, orderId: sampleOrderId, ingredientId: 'ing_beans', quantity: 18, status: 'active', createdAt: now },
      { id: 'res_2', envMode: 'demo', branchId, orderId: sampleOrderId, ingredientId: 'ing_milk', quantity: 180, status: 'active', createdAt: now },
      { id: 'res_3', envMode: 'demo', branchId, orderId: sampleOrderId, ingredientId: 'ing_condensed', quantity: 30, status: 'active', createdAt: now },
      { id: 'res_4', envMode: 'demo', branchId, orderId: sampleOrderId, ingredientId: 'ing_croissant', quantity: 1, status: 'active', createdAt: now },
    ],
    zones,
    tables,
    tableCarts: {
      tbl_1: [],
    },
    serviceRequests: [],
    orders: [sampleOrder],
    payments: [
      {
        id: 'pay_demo_1',
        envMode: 'demo',
        branchId,
        orderId: sampleOrderId,
        method: 'cash',
        amount: 320,
        status: 'verified',
        verifiedByName: 'Paolo Mendoza',
        verifiedAt: now,
        idempotencyKey: 'pay_seed_1',
        createdAt: now,
      },
    ],
    deliveries: [],
    cashDrawers: [
      { id: 'drw_1', envMode: 'demo', branchId, name: 'Main Counter Drawer 1', isActive: true },
    ],
    shifts: [
      {
        id: 'shf_demo_1',
        envMode: 'demo',
        branchId,
        drawerId: 'drw_1',
        cashierId: 'usr_cashier',
        cashierName: 'Paolo Mendoza',
        status: 'open',
        openingCash: 5000,
        cashSalesExpected: 320,
        cashInTotal: 0,
        cashOutTotal: 0,
        expectedCash: 5320,
        blindCount: false,
        openedAt: now,
        movements: [],
      },
    ],
    printers: [
      { id: 'prt_1', envMode: 'demo', branchId, name: 'Counter Thermal 80mm', target: 'receipt', paperSize: '80mm', isDefault: true, isActive: true },
      { id: 'prt_2', envMode: 'demo', branchId, name: 'Barista Ticket Printer', target: 'kitchen', paperSize: '58mm', isDefault: false, isActive: true },
    ],
    notifications: [
      {
        id: 'notif_1',
        envMode: 'demo',
        branchId,
        targetRole: 'manager',
        category: 'low_stock',
        title: 'Low Stock Alert: Uji Ceremonial Matcha',
        message: 'Available stock (180 g) is below reorder point (200 g).',
        referenceId: 'ing_matcha',
        isRead: false,
        createdAt: now,
      },
    ],
    auditLogs: [
      {
        id: 'aud_1',
        envMode: 'demo',
        branchId,
        actorUserId: 'usr_owner',
        actorName: 'Marco Santos',
        action: 'demo_environment_initialized',
        module: 'settings',
        reason: 'Isolated Demo mode started',
        createdAt: now,
      },
    ],
    sequences: {
      [`${dateKey}:pos`]: 1,
    },
  };
}

export function loadDemoState(): DemoState {
  try {
    const raw = sessionStorage.getItem(DEMO_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as DemoState;
    }
  } catch {
    // ignore storage errors
  }
  const initial = createInitialDemoState();
  saveDemoState(initial);
  return initial;
}

export function saveDemoState(state: DemoState): void {
  try {
    sessionStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage errors
  }
}

export function resetDemoState(): DemoState {
  const fresh = createInitialDemoState();
  saveDemoState(fresh);
  return fresh;
}

export function recomputeDemoProductAvailability(state: DemoState): void {
  for (const prod of state.products) {
    if (prod.manualUnavailable) {
      prod.isAvailable = false;
      continue;
    }
    const { preparable } = isProductPreparable(prod, state.recipes, state.ingredients);
    prod.isAvailable = preparable;
  }
}

export function demoPlaceOrder(
  state: DemoState,
  payload: {
    channel: OrderChannel;
    orderType: OrderType;
    tableId?: string;
    customerName?: string;
    customerPhone?: string;
    deliveryAddress?: string;
    deliveryNotes?: string;
    deliveryFee?: number;
    discountTotal?: number;
    discountReason?: string;
    orderNotes?: string;
    isPriority?: boolean;
    idempotencyKey: string;
    actorName: string;
    items: Array<{
      productId: string;
      variantId?: string;
      variantName?: string;
      quantity: number;
      unitPrice: number;
      modifiers: SelectedModifier[];
      notes?: string;
    }>;
  }
): { state: DemoState; order: Order } {
  const existing = state.orders.find((o) => o.idempotencyKey === payload.idempotencyKey);
  if (existing) return { state, order: existing };

  const next: DemoState = structuredClone(state);
  const dateKey = formatManilaDateKey();
  const seqKey = `${dateKey}:${payload.channel}`;
  const nextSeq = (next.sequences[seqKey] ?? 0) + 1;
  next.sequences[seqKey] = nextSeq;

  const { orderNumber, queueNumber } = formatOrderNumber({
    branchPrefix: next.branch.orderPrefix,
    channel: payload.channel,
    dateKey,
    seq: nextSeq,
  });

  const itemsSubtotal = payload.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const defaultTax = next.taxProfiles.find((t) => t.isDefault) ?? next.taxProfiles[0];
  const totals = calculateOrderTotals({
    itemsSubtotal,
    discountAmount: payload.discountTotal ?? 0,
    deliveryFee: payload.deliveryFee ?? 0,
    taxProfile: defaultTax,
  });

  const policy = next.channelPolicies.find((p) => p.channel === payload.channel);
  const initialStatus =
    payload.channel === 'pos'
      ? 'confirmed'
      : policy?.approvalPolicy === 'staff_approval'
        ? 'pending'
        : 'confirmed';

  // Check ingredient availability before accepting
  const demand = computeOrderIngredientRequirements(payload.items, next.recipes);
  const availCheck = checkStockAvailabilityForDemand(demand, next.ingredients);
  if (!availCheck.ok) {
    const first = availCheck.shortages[0];
    throw new Error(
      `Insufficient stock for ${first.name}: requires ${first.required} ${first.unit}, available ${first.available} ${first.unit}`
    );
  }

  const now = new Date().toISOString();
  const orderId = uid('ord');
  const orderItems: OrderItem[] = payload.items.map((line) => {
    const prod = next.products.find((p) => p.id === line.productId)!;
    const recipe =
      next.recipes.find((r) => r.productId === line.productId && r.variantId === line.variantId) ??
      next.recipes.find((r) => r.productId === line.productId && !r.variantId);
    const unitCostSnapshot = calculateRecipeUnitCost(recipe, next.ingredients, line.modifiers);
    return {
      id: uid('oi'),
      orderId,
      productId: prod.id,
      variantId: line.variantId,
      kdsStationId: prod.kdsStationId,
      productName: prod.name,
      variantName: line.variantName,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      modifiers: line.modifiers,
      notes: line.notes,
      unitCostSnapshot,
      lineTotal: round2(line.unitPrice * line.quantity),
      kdsStatus: 'queued',
    };
  });

  const order: Order = {
    id: orderId,
    envMode: 'demo',
    branchId: next.branch.id,
    orderNumber,
    queueNumber,
    channel: payload.channel,
    orderType: payload.orderType,
    tableId: payload.tableId,
    status: initialStatus,
    paymentStatus: 'unpaid',
    customerName: payload.customerName,
    customerPhone: payload.customerPhone,
    deliveryAddress: payload.deliveryAddress,
    deliveryNotes: payload.deliveryNotes,
    deliveryFee: totals.deliveryFee,
    subtotal: totals.subtotal,
    discountTotal: totals.discountTotal,
    discountReason: payload.discountReason,
    taxTotal: totals.taxTotal,
    totalAmount: totals.totalAmount,
    isPriority: Boolean(payload.isPriority),
    orderNotes: payload.orderNotes,
    idempotencyKey: payload.idempotencyKey,
    trackingToken: uid('trk'),
    createdByName: payload.actorName,
    createdAt: now,
    updatedAt: now,
    items: orderItems,
  };

  next.orders.unshift(order);

  // Reserve ingredients if confirmed
  if (initialStatus === 'confirmed') {
    for (const [ingredientId, qty] of Object.entries(demand)) {
      const ing = next.ingredients.find((i) => i.id === ingredientId);
      if (ing) {
        ing.reservedStock = round2(ing.reservedStock + qty);
        next.reservations.push({
          id: uid('res'),
          envMode: 'demo',
          branchId: next.branch.id,
          orderId,
          ingredientId,
          quantity: round2(qty),
          status: 'active',
          createdAt: now,
        });
      }
    }
    recomputeDemoProductAvailability(next);
  }

  if (payload.tableId) {
    const tbl = next.tables.find((t) => t.id === payload.tableId);
    if (tbl) tbl.status = 'occupied';
  }

  if (payload.orderType === 'delivery') {
    next.deliveries.unshift({
      id: uid('del'),
      envMode: 'demo',
      branchId: next.branch.id,
      orderId,
      deliveryStatus: 'unassigned',
      customerName: payload.customerName || 'Guest Customer',
      customerPhone: payload.customerPhone || 'N/A',
      address: payload.deliveryAddress || 'Address pending',
      deliveryInstructions: payload.deliveryNotes,
      deliveryFee: totals.deliveryFee,
      otpCode: String(Math.floor(1000 + Math.random() * 9000)),
    });
  }

  next.notifications.unshift({
    id: uid('notif'),
    envMode: 'demo',
    branchId: next.branch.id,
    category: 'new_order',
    title: `New ${payload.channel.toUpperCase()} Order ${queueNumber}`,
    message: `${orderItems.length} item(s) · ${orderNumber}`,
    referenceId: orderId,
    isRead: false,
    createdAt: now,
  });

  next.auditLogs.unshift({
    id: uid('aud'),
    envMode: 'demo',
    branchId: next.branch.id,
    actorName: payload.actorName,
    action: 'order_placed',
    module: 'orders',
    targetId: orderId,
    createdAt: now,
  });

  saveDemoState(next);
  return { state: next, order };
}

export function demoAdvanceKdsItem(
  state: DemoState,
  orderId: string,
  itemId: string,
  nextStatus: KdsTicketStatus,
  actorName: string
): DemoState {
  const next: DemoState = structuredClone(state);
  const order = next.orders.find((o) => o.id === orderId);
  if (!order) return state;
  const item = order.items.find((i) => i.id === itemId);
  if (!item) return state;
  const now = new Date().toISOString();

  // Consume active reservations when preparation starts
  if (nextStatus === 'preparing') {
    const activeRes = next.reservations.filter((r) => r.orderId === orderId && r.status === 'active');
    for (const res of activeRes) {
      const ing = next.ingredients.find((i) => i.id === res.ingredientId);
      if (ing) {
        ing.reservedStock = round2(Math.max(0, ing.reservedStock - res.quantity));
        ing.currentStock = round2(Math.max(0, ing.currentStock - res.quantity));
        next.movements.unshift({
          id: uid('mov'),
          envMode: 'demo',
          branchId: next.branch.id,
          ingredientId: ing.id,
          movementType: 'consume',
          quantityDelta: -res.quantity,
          balanceAfter: ing.currentStock,
          unitCost: ing.unitCost,
          referenceType: 'order',
          referenceId: orderId,
          reason: `Consumed when prep started on ${order.orderNumber}`,
          createdBy: actorName,
          createdAt: now,
        });
        if (ing.currentStock - ing.reservedStock <= ing.reorderPoint) {
          next.notifications.unshift({
            id: uid('notif'),
            envMode: 'demo',
            branchId: next.branch.id,
            targetRole: 'manager',
            category: 'low_stock',
            title: `Low Stock Alert: ${ing.name}`,
            message: `Remaining ${round2(ing.currentStock - ing.reservedStock)} ${ing.recipeUnit} (Reorder at ${ing.reorderPoint} ${ing.recipeUnit}).`,
            referenceId: ing.id,
            isRead: false,
            createdAt: now,
          });
        }
      }
      res.status = 'consumed';
    }
    if (!item.prepStartedAt) item.prepStartedAt = now;
  }

  if ((nextStatus === 'ready' || nextStatus === 'bumped') && !item.prepReadyAt) {
    item.prepReadyAt = now;
  }
  item.kdsStatus = nextStatus;
  item.assignedStaffName = actorName;

  order.status = deriveOrderStatusFromKdsItems(order.status, order.items);
  order.updatedAt = now;

  recomputeDemoProductAvailability(next);
  saveDemoState(next);
  return next;
}

export function demoRecordAndVerifyPayment(
  state: DemoState,
  params: {
    orderId: string;
    method: PaymentMethod;
    amount: number;
    referenceNumber?: string;
    autoVerifyCash?: boolean;
    actorName: string;
    idempotencyKey: string;
  }
): DemoState {
  if (state.payments.some((p) => p.idempotencyKey === params.idempotencyKey)) {
    return state;
  }
  const next: DemoState = structuredClone(state);
  const order = next.orders.find((o) => o.id === params.orderId);
  if (!order) return state;
  const now = new Date().toISOString();
  const isCashVerified = params.method === 'cash' && params.autoVerifyCash !== false;

  const payment: PaymentRecord = {
    id: uid('pay'),
    envMode: 'demo',
    branchId: next.branch.id,
    orderId: params.orderId,
    method: params.method,
    amount: round2(params.amount),
    referenceNumber: params.referenceNumber,
    status: isCashVerified ? 'verified' : 'pending_verification',
    verifiedByName: isCashVerified ? params.actorName : undefined,
    verifiedAt: isCashVerified ? now : undefined,
    idempotencyKey: params.idempotencyKey,
    createdAt: now,
  };
  next.payments.unshift(payment);

  if (isCashVerified) {
    const totalPaid = next.payments
      .filter((p) => p.orderId === order.id && p.status === 'verified')
      .reduce((s, p) => s + p.amount, 0);
    order.paymentStatus = totalPaid >= order.totalAmount ? 'paid' : 'pending_verification';

    const openShift = next.shifts.find((s) => s.status === 'open');
    if (openShift) {
      openShift.cashSalesExpected = round2(openShift.cashSalesExpected + payment.amount);
      openShift.expectedCash = round2(
        openShift.openingCash + openShift.cashSalesExpected + openShift.cashInTotal - openShift.cashOutTotal
      );
    }
  } else {
    order.paymentStatus = 'pending_verification';
  }
  order.updatedAt = now;

  next.auditLogs.unshift({
    id: uid('aud'),
    envMode: 'demo',
    branchId: next.branch.id,
    actorName: params.actorName,
    action: isCashVerified ? 'cash_payment_recorded' : 'digital_payment_submitted',
    module: 'payments',
    targetId: payment.id,
    createdAt: now,
  });

  saveDemoState(next);
  return next;
}

export function demoVerifyPayment(
  state: DemoState,
  paymentId: string,
  approve: boolean,
  actorName: string,
  rejectionReason?: string
): DemoState {
  const next: DemoState = structuredClone(state);
  const payment = next.payments.find((p) => p.id === paymentId);
  if (!payment || payment.status !== 'pending_verification') return state;
  const now = new Date().toISOString();
  payment.status = approve ? 'verified' : 'rejected';
  payment.verifiedByName = actorName;
  payment.verifiedAt = now;
  if (!approve) payment.rejectionReason = rejectionReason || 'Reference could not be matched';

  const order = next.orders.find((o) => o.id === payment.orderId);
  if (order) {
    if (approve) {
      const paidSum = next.payments
        .filter((p) => p.orderId === order.id && p.status === 'verified')
        .reduce((s, p) => s + p.amount, 0);
      order.paymentStatus = paidSum >= order.totalAmount ? 'paid' : 'pending_verification';
    } else {
      order.paymentStatus = 'failed';
    }
    order.updatedAt = now;
  }

  next.auditLogs.unshift({
    id: uid('aud'),
    envMode: 'demo',
    branchId: next.branch.id,
    actorName,
    action: approve ? 'payment_verified' : 'payment_rejected',
    module: 'payments',
    targetId: paymentId,
    reason: rejectionReason,
    createdAt: now,
  });

  saveDemoState(next);
  return next;
}

export function demoCancelOrder(
  state: DemoState,
  orderId: string,
  reason: string,
  actorName: string
): DemoState {
  const next: DemoState = structuredClone(state);
  const order = next.orders.find((o) => o.id === orderId);
  if (!order || order.status === 'cancelled') return state;
  const now = new Date().toISOString();

  // Release ONLY active (unconsumed) reservations. Never auto-restore consumed stock.
  const activeRes = next.reservations.filter((r) => r.orderId === orderId && r.status === 'active');
  for (const res of activeRes) {
    const ing = next.ingredients.find((i) => i.id === res.ingredientId);
    if (ing) {
      ing.reservedStock = round2(Math.max(0, ing.reservedStock - res.quantity));
    }
    res.status = 'released';
  }

  order.status = 'cancelled';
  order.updatedAt = now;
  order.items.forEach((i) => (i.kdsStatus = 'cancelled'));
  recomputeDemoProductAvailability(next);

  next.auditLogs.unshift({
    id: uid('aud'),
    envMode: 'demo',
    branchId: next.branch.id,
    actorName,
    action: 'order_cancelled',
    module: 'orders',
    targetId: orderId,
    reason,
    createdAt: now,
  });

  saveDemoState(next);
  return next;
}

export function demoCloseShift(
  state: DemoState,
  shiftId: string,
  denominations: Record<string, number>,
  actorName: string,
  notes?: string
): DemoState {
  const next: DemoState = structuredClone(state);
  const shift = next.shifts.find((s) => s.id === shiftId);
  if (!shift || shift.status !== 'open') return state;
  const actual = calculateDenominationsTotal(denominations);
  const now = new Date().toISOString();
  shift.denominations = denominations;
  shift.actualCash = actual;
  shift.variance = round2(actual - shift.expectedCash);
  shift.status = Math.abs(shift.variance) > 50 ? 'pending_approval' : 'closed';
  shift.closedAt = now;
  shift.notes = notes;
  if (shift.status === 'closed') shift.approvedByName = actorName;

  next.auditLogs.unshift({
    id: uid('aud'),
    envMode: 'demo',
    branchId: next.branch.id,
    actorName,
    action: 'cash_shift_closed',
    module: 'cash_drawer',
    targetId: shiftId,
    reason: notes,
    metadata: { expected: shift.expectedCash, actual, variance: shift.variance },
    createdAt: now,
  });

  saveDemoState(next);
  return next;
}

export function demoConfirmPendingOrder(
  state: DemoState,
  orderId: string,
  actorName: string
): DemoState {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order || order.status !== 'pending') return state;

  const next: DemoState = structuredClone(state);
  const targetOrder = next.orders.find((o) => o.id === orderId)!;
  const demand = computeOrderIngredientRequirements(
    targetOrder.items.map((i) => ({
      productId: i.productId,
      variantId: i.variantId,
      quantity: i.quantity,
      modifiers: i.modifiers,
    })),
    next.recipes
  );
  const availCheck = checkStockAvailabilityForDemand(demand, next.ingredients);
  if (!availCheck.ok) {
    const first = availCheck.shortages[0];
    throw new Error(
      `Insufficient stock to approve order for ${first.name}: requires ${first.required} ${first.unit}, available ${first.available} ${first.unit}`
    );
  }

  const now = new Date().toISOString();
  for (const [ingredientId, qty] of Object.entries(demand)) {
    const ing = next.ingredients.find((i) => i.id === ingredientId);
    if (ing) {
      ing.reservedStock = round2(ing.reservedStock + qty);
      next.reservations.push({
        id: uid('res'),
        envMode: 'demo',
        branchId: next.branch.id,
        orderId,
        ingredientId,
        quantity: round2(qty),
        status: 'active',
        createdAt: now,
      });
    }
  }

  targetOrder.status = 'confirmed';
  targetOrder.updatedAt = now;
  recomputeDemoProductAvailability(next);

  next.auditLogs.unshift({
    id: uid('aud'),
    envMode: 'demo',
    branchId: next.branch.id,
    actorName,
    action: 'order_confirmed',
    module: 'orders',
    targetId: orderId,
    createdAt: now,
  });

  saveDemoState(next);
  return next;
}

export function demoRefundPayment(
  state: DemoState,
  paymentId: string,
  actorName: string,
  reason: string
): DemoState {
  if (!reason.trim()) {
    throw new Error('Refund reason is required.');
  }
  const existing = state.payments.find((p) => p.id === paymentId);
  if (!existing) throw new Error('Payment record not found.');
  if (existing.status === 'refunded') return state;
  if (existing.status !== 'verified') {
    throw new Error('Only verified payments can be refunded.');
  }

  const next: DemoState = structuredClone(state);
  const payment = next.payments.find((p) => p.id === paymentId)!;
  const now = new Date().toISOString();
  payment.status = 'refunded';
  payment.rejectionReason = reason.trim();

  const order = next.orders.find((o) => o.id === payment.orderId);
  if (order) {
    const remainingPaid = next.payments
      .filter((p) => p.orderId === order.id && p.status === 'verified')
      .reduce((s, p) => s + p.amount, 0);
    order.paymentStatus =
      remainingPaid <= 0
        ? 'refunded'
        : remainingPaid < order.totalAmount
          ? 'partially_refunded'
          : 'paid';
    order.updatedAt = now;
  }

  if (payment.method === 'cash') {
    const openShift = next.shifts.find((s) => s.status === 'open');
    if (openShift) {
      openShift.cashSalesExpected = round2(Math.max(0, openShift.cashSalesExpected - payment.amount));
      openShift.expectedCash = round2(
        openShift.openingCash + openShift.cashSalesExpected + openShift.cashInTotal - openShift.cashOutTotal
      );
    }
  }

  next.auditLogs.unshift({
    id: uid('aud'),
    envMode: 'demo',
    branchId: next.branch.id,
    actorName,
    action: 'payment_refunded',
    module: 'payments',
    targetId: paymentId,
    reason: reason.trim(),
    metadata: { amount: payment.amount, method: payment.method },
    createdAt: now,
  });

  saveDemoState(next);
  return next;
}

export function demoUpdateDeliveryStatus(
  state: DemoState,
  deliveryId: string,
  status: DeliveryRecord['deliveryStatus'],
  actorName: string,
  otpInput?: string,
  notes?: string
): DemoState {
  const existing = state.deliveries.find((d) => d.id === deliveryId);
  if (!existing) return state;

  if (status === 'delivered' && existing.otpCode && (otpInput ?? '').trim() !== existing.otpCode) {
    throw new Error('Customer delivery OTP does not match.');
  }
  if (status === 'failed' && !(notes ?? '').trim()) {
    throw new Error('Failure reason is required when marking delivery failed.');
  }

  const next: DemoState = structuredClone(state);
  const del = next.deliveries.find((d) => d.id === deliveryId)!;
  const now = new Date().toISOString();
  del.deliveryStatus = status;

  if (notes?.trim()) {
    if (status === 'failed') del.failedReason = notes.trim();
    else del.riderNotes = notes.trim();
  }
  if (status === 'delivered') {
    del.deliveredAt = now;
    const ord = next.orders.find((o) => o.id === del.orderId);
    if (ord) {
      ord.status = 'completed';
      ord.updatedAt = now;
    }
  }

  next.auditLogs.unshift({
    id: uid('aud'),
    envMode: 'demo',
    branchId: next.branch.id,
    actorName,
    action: 'delivery_status_updated',
    module: 'delivery',
    targetId: deliveryId,
    reason: notes?.trim(),
    metadata: { status },
    createdAt: now,
  });

  saveDemoState(next);
  return next;
}

export function demoAssignRoleSwitch(state: DemoState, roleKey: StaffRoleKey): UserProfile {
  return state.users.find((u) => u.roleKey === roleKey) ?? state.users[0];
}
