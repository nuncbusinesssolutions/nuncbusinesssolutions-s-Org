import {
  AppModule,
  Ingredient,
  OrderItem,
  PermissionAction,
  Product,
  Recipe,
  RolePermissionsMap,
  SelectedModifier,
  StaffRoleKey,
  TaxProfile,
  UserProfile,
} from '../types/cafe';

export const PHP_FORMATTER = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPHP(amount: number): string {
  return PHP_FORMATTER.format(Number.isFinite(amount) ? amount : 0);
}

export function formatManilaTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatManilaDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

export const ALL_MODULES: AppModule[] = [
  'dashboard',
  'pos',
  'orders',
  'tables',
  'kds',
  'menu',
  'inventory',
  'recipes',
  'payments',
  'cash_drawer',
  'delivery',
  'staff',
  'settings',
  'audit',
];

function allowAll(): Record<PermissionAction, boolean> {
  return { view: true, create: true, edit: true, delete: true, approve: true, export: true };
}

function allowNone(): Record<PermissionAction, boolean> {
  return { view: false, create: false, edit: false, delete: false, approve: false, export: false };
}

function allow(actions: PermissionAction[]): Record<PermissionAction, boolean> {
  const base = allowNone();
  for (const a of actions) base[a] = true;
  return base;
}

export const DEFAULT_ROLE_PERMISSIONS: Record<StaffRoleKey, RolePermissionsMap> = {
  super_admin: Object.fromEntries(ALL_MODULES.map((m) => [m, allowAll()])) as RolePermissionsMap,
  manager: {
    dashboard: allow(['view', 'export']),
    pos: allow(['view', 'create', 'edit', 'approve']),
    orders: allow(['view', 'create', 'edit', 'approve', 'export']),
    tables: allow(['view', 'create', 'edit', 'delete']),
    kds: allow(['view', 'edit']),
    menu: allow(['view', 'create', 'edit', 'approve', 'export']),
    inventory: allow(['view', 'create', 'edit', 'approve', 'export']),
    recipes: allow(['view', 'create', 'edit', 'export']),
    payments: allow(['view', 'create', 'edit', 'approve', 'export']),
    cash_drawer: allow(['view', 'create', 'edit', 'approve', 'export']),
    delivery: allow(['view', 'create', 'edit', 'approve']),
    staff: allow(['view', 'create', 'edit']),
    settings: allow(['view', 'edit']),
    audit: allow(['view', 'export']),
  },
  cashier: {
    dashboard: allow(['view']),
    pos: allow(['view', 'create', 'edit']),
    orders: allow(['view', 'create', 'edit']),
    tables: allow(['view', 'edit']),
    kds: allow(['view']),
    menu: allow(['view']),
    inventory: allow(['view']),
    recipes: allow(['view']),
    payments: allow(['view', 'create', 'approve']),
    cash_drawer: allow(['view', 'create', 'edit']),
    delivery: allow(['view', 'create', 'edit']),
    staff: allowNone(),
    settings: allowNone(),
    audit: allowNone(),
  },
  barista: {
    dashboard: allow(['view']),
    pos: allowNone(),
    orders: allow(['view', 'edit']),
    tables: allow(['view']),
    kds: allow(['view', 'edit']),
    menu: allow(['view', 'edit']),
    inventory: allow(['view']),
    recipes: allow(['view']),
    payments: allowNone(),
    cash_drawer: allowNone(),
    delivery: allowNone(),
    staff: allowNone(),
    settings: allowNone(),
    audit: allowNone(),
  },
  rider: {
    dashboard: allow(['view']),
    pos: allowNone(),
    orders: allow(['view']),
    tables: allowNone(),
    kds: allowNone(),
    menu: allowNone(),
    inventory: allowNone(),
    recipes: allowNone(),
    payments: allow(['view', 'create']),
    cash_drawer: allowNone(),
    delivery: allow(['view', 'edit']),
    staff: allowNone(),
    settings: allowNone(),
    audit: allowNone(),
  },
};

export function hasModulePermission(
  user: UserProfile | null,
  module: AppModule,
  action: PermissionAction
): boolean {
  if (!user || !user.isActive) return false;
  if (user.roleKey === 'super_admin') return true;
  const override = user.customPermissions?.[module]?.[action];
  if (typeof override === 'boolean') return override;
  return Boolean(DEFAULT_ROLE_PERMISSIONS[user.roleKey]?.[module]?.[action]);
}

export interface OrderPricingBreakdown {
  subtotal: number;
  discountTotal: number;
  taxableNet: number;
  taxTotal: number;
  deliveryFee: number;
  totalAmount: number;
}

/**
 * Computes order totals respecting VAT/non-VAT and tax-inclusive vs tax-exclusive configuration.
 * Never hardcodes a VAT rate; strictly uses the supplied TaxProfile.
 */
export function calculateOrderTotals(params: {
  itemsSubtotal: number;
  discountAmount: number;
  deliveryFee: number;
  taxProfile: Pick<TaxProfile, 'taxType' | 'pricingMode' | 'ratePercent' | 'isExempt'>;
}): OrderPricingBreakdown {
  const subtotal = Math.max(0, round2(params.itemsSubtotal));
  const discountTotal = Math.min(subtotal, Math.max(0, round2(params.discountAmount)));
  const discountedGoods = round2(subtotal - discountTotal);
  const deliveryFee = Math.max(0, round2(params.deliveryFee));

  if (params.taxProfile.isExempt || params.taxProfile.taxType === 'non_vat' || params.taxProfile.ratePercent <= 0) {
    return {
      subtotal,
      discountTotal,
      taxableNet: discountedGoods,
      taxTotal: 0,
      deliveryFee,
      totalAmount: round2(discountedGoods + deliveryFee),
    };
  }

  const rate = params.taxProfile.ratePercent / 100;
  if (params.taxProfile.pricingMode === 'inclusive') {
    const net = round2(discountedGoods / (1 + rate));
    const taxTotal = round2(discountedGoods - net);
    return {
      subtotal,
      discountTotal,
      taxableNet: net,
      taxTotal,
      deliveryFee,
      totalAmount: round2(discountedGoods + deliveryFee),
    };
  }

  // Exclusive pricing: tax added on top of discounted goods
  const taxTotal = round2(discountedGoods * rate);
  return {
    subtotal,
    discountTotal,
    taxableNet: discountedGoods,
    taxTotal,
    deliveryFee,
    totalAmount: round2(discountedGoods + taxTotal + deliveryFee),
  };
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function calculateRecipeUnitCost(
  recipe: Recipe | undefined,
  ingredients: Ingredient[],
  modifiers: SelectedModifier[] = []
): number {
  let totalCost = 0;
  if (recipe) {
    const wasteMultiplier = 1 + (recipe.wasteFactorPercent || 0) / 100;
    for (const item of recipe.items) {
      const ing = ingredients.find((i) => i.id === item.ingredientId);
      if (ing) {
        totalCost += item.quantity * ing.unitCost * wasteMultiplier;
      }
    }
  }
  for (const mod of modifiers) {
    if (mod.ingredientId && mod.ingredientQtyDelta) {
      const ing = ingredients.find((i) => i.id === mod.ingredientId);
      if (ing) {
        totalCost += mod.ingredientQtyDelta * ing.unitCost;
      }
    }
  }
  return round2(Math.max(0, totalCost));
}

export interface RequiredIngredientMap {
  [ingredientId: string]: number;
}

/**
 * Computes exact recipe + modifier ingredient demand (in recipe units) for an order line list.
 */
export function computeOrderIngredientRequirements(
  lines: Array<{
    productId: string;
    variantId?: string;
    quantity: number;
    modifiers?: SelectedModifier[];
  }>,
  recipes: Recipe[]
): RequiredIngredientMap {
  const demand: RequiredIngredientMap = {};
  for (const line of lines) {
    const recipe =
      recipes.find((r) => r.productId === line.productId && r.variantId === line.variantId) ??
      recipes.find((r) => r.productId === line.productId && !r.variantId);
    if (recipe) {
      const wasteMultiplier = 1 + (recipe.wasteFactorPercent || 0) / 100;
      for (const rItem of recipe.items) {
        const qty = rItem.quantity * line.quantity * wasteMultiplier;
        demand[rItem.ingredientId] = (demand[rItem.ingredientId] ?? 0) + qty;
      }
    }
    for (const mod of line.modifiers ?? []) {
      if (mod.ingredientId && mod.ingredientQtyDelta) {
        const qty = mod.ingredientQtyDelta * line.quantity;
        demand[mod.ingredientId] = (demand[mod.ingredientId] ?? 0) + qty;
      }
    }
  }
  return demand;
}

/**
 * Validates that available (currentStock - reservedStock) covers required demand.
 */
export function checkStockAvailabilityForDemand(
  demand: RequiredIngredientMap,
  ingredients: Ingredient[]
): { ok: boolean; shortages: Array<{ ingredientId: string; name: string; required: number; available: number; unit: string }> } {
  const shortages: Array<{ ingredientId: string; name: string; required: number; available: number; unit: string }> = [];
  for (const [ingredientId, required] of Object.entries(demand)) {
    const ing = ingredients.find((i) => i.id === ingredientId);
    if (!ing) continue;
    const available = Math.max(0, ing.currentStock - ing.reservedStock);
    if (available + 1e-6 < required) {
      shortages.push({
        ingredientId,
        name: ing.name,
        required: round2(required),
        available: round2(available),
        unit: ing.recipeUnit,
      });
    }
  }
  return { ok: shortages.length === 0, shortages };
}

/**
 * Determines whether a product can currently be prepared based on its default/any recipe and available stock.
 */
export function isProductPreparable(
  product: Product,
  recipes: Recipe[],
  ingredients: Ingredient[]
): { preparable: boolean; missingIngredientNames: string[] } {
  if (product.manualUnavailable) {
    return { preparable: false, missingIngredientNames: [] };
  }
  const productRecipes = recipes.filter((r) => r.productId === product.id);
  if (productRecipes.length === 0) {
    return { preparable: true, missingIngredientNames: [] };
  }
  // Check primary recipe (or first recipe)
  const primary = productRecipes.find((r) => !r.variantId) ?? productRecipes[0];
  const demand: RequiredIngredientMap = {};
  for (const rItem of primary.items) {
    demand[rItem.ingredientId] = (demand[rItem.ingredientId] ?? 0) + rItem.quantity;
  }
  const check = checkStockAvailabilityForDemand(demand, ingredients);
  return {
    preparable: check.ok,
    missingIngredientNames: check.shortages.map((s) => s.name),
  };
}

/**
 * Multi-station KDS rollup: entire order is ONLY 'ready' once ALL active items are 'ready' or 'bumped'.
 */
export function deriveOrderStatusFromKdsItems(
  currentStatus: string,
  items: Pick<OrderItem, 'kdsStatus'>[]
): 'confirmed' | 'preparing' | 'ready' {
  const active = items.filter((i) => i.kdsStatus !== 'cancelled');
  if (active.length === 0) return currentStatus === 'preparing' ? 'preparing' : 'confirmed';
  const allReady = active.every((i) => i.kdsStatus === 'ready' || i.kdsStatus === 'bumped');
  if (allReady) return 'ready';
  const anyStarted = active.some(
    (i) => i.kdsStatus === 'preparing' || i.kdsStatus === 'ready' || i.kdsStatus === 'bumped'
  );
  if (anyStarted) return 'preparing';
  return 'confirmed';
}

export const PHP_DENOMINATIONS = [1000, 500, 200, 100, 50, 20, 10, 5, 1, 0.25] as const;

export function calculateDenominationsTotal(counts: Record<string, number>): number {
  let sum = 0;
  for (const denom of PHP_DENOMINATIONS) {
    const qty = Math.max(0, Math.floor(counts[String(denom)] ?? 0));
    sum += denom * qty;
  }
  return round2(sum);
}

export function formatOrderNumber(params: {
  branchPrefix: string;
  channel: 'pos' | 'qr_table' | 'kiosk' | 'online';
  dateKey: string;
  seq: number;
}): { orderNumber: string; queueNumber: string } {
  const channelPrefixMap = {
    pos: 'POS',
    qr_table: 'QR',
    kiosk: 'KSK',
    online: 'ONL',
  } as const;
  const compactDate = params.dateKey.replace(/-/g, '').slice(2); // YYMMDD
  const seqPad = String(params.seq).padStart(4, '0');
  const ch = channelPrefixMap[params.channel];
  const orderNumber = `${params.branchPrefix}-${ch}-${compactDate}-${seqPad}`;
  const queuePrefix = ch.charAt(0);
  const queueNumber = `${queuePrefix}-${String(params.seq).padStart(3, '0')}`;
  return { orderNumber, queueNumber };
}

export function parseCsvText(csvText: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { headers: [], rows: [] };
  const splitLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };
  const headers = splitLine(lines[0]).map((h) => h.toLowerCase());
  const rows = lines.slice(1).map((line) => {
    const values = splitLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = values[idx] ?? '';
    });
    return obj;
  });
  return { headers, rows };
}
