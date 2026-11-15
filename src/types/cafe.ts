export type EnvironmentMode = 'production' | 'demo';

export type StaffRoleKey =
  | 'super_admin'
  | 'manager'
  | 'cashier'
  | 'barista'
  | 'rider';

export type PermissionAction =
  | 'view'
  | 'create'
  | 'edit'
  | 'delete'
  | 'approve'
  | 'export';

export type AppModule =
  | 'dashboard'
  | 'pos'
  | 'orders'
  | 'tables'
  | 'kds'
  | 'menu'
  | 'inventory'
  | 'recipes'
  | 'payments'
  | 'cash_drawer'
  | 'delivery'
  | 'staff'
  | 'settings'
  | 'audit';

export type RolePermissionsMap = Record<AppModule, Record<PermissionAction, boolean>>;

export type TaxType = 'vat' | 'non_vat';
export type TaxPricingMode = 'inclusive' | 'exclusive';

export type OrderChannel = 'pos' | 'qr_table' | 'kiosk' | 'online';
export type OrderType = 'dine_in' | 'takeout' | 'delivery';
export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'completed'
  | 'cancelled';

export type PaymentStatus =
  | 'unpaid'
  | 'pending_verification'
  | 'paid'
  | 'failed'
  | 'refunded'
  | 'partially_refunded';

export type PaymentMethod =
  | 'cash'
  | 'gcash'
  | 'maya'
  | 'card'
  | 'bank_transfer';

export type DeliveryStatus =
  | 'unassigned'
  | 'assigned'
  | 'picked_up'
  | 'in_transit'
  | 'delivered'
  | 'failed';

export type TableStatus = 'available' | 'occupied' | 'reserved' | 'unavailable';

export type KdsTicketStatus = 'queued' | 'preparing' | 'ready' | 'bumped' | 'cancelled';

export type ChannelApprovalPolicy =
  | 'auto_confirm'
  | 'staff_approval'
  | 'auto_with_exception';

export interface BusinessSettings {
  id: string;
  envMode: EnvironmentMode;
  businessName: string;
  logoUrl?: string;
  address: string;
  phone: string;
  email: string;
  tin?: string;
  currencyCode: string;
  currencySymbol: string;
  timezone: string;
  isSetupCompleted: boolean;
  setupStep: number;
  receiptFooter: string;
}

export interface Branch {
  id: string;
  envMode: EnvironmentMode;
  code: string;
  name: string;
  address: string;
  phone: string;
  isPrimary: boolean;
  isActive: boolean;
  orderPrefix: string;
}

export interface BranchHour {
  id: string;
  branchId: string;
  dayOfWeek: number; // 0 = Sun ... 6 = Sat
  openTime: string;
  closeTime: string;
  isClosed: boolean;
}

export interface TaxProfile {
  id: string;
  envMode: EnvironmentMode;
  branchId: string;
  name: string;
  taxType: TaxType;
  pricingMode: TaxPricingMode;
  ratePercent: number;
  isExempt: boolean;
  isDefault: boolean;
}

export interface ChannelPolicy {
  id: string;
  envMode: EnvironmentMode;
  branchId: string;
  channel: OrderChannel;
  approvalPolicy: ChannelApprovalPolicy;
  requirePaymentBeforeConfirm: boolean;
}

export interface UserProfile {
  id: string;
  envMode: EnvironmentMode;
  branchId: string;
  fullName: string;
  email: string;
  phone?: string;
  roleKey: StaffRoleKey;
  isActive: boolean;
  sessionTimeoutMinutes: number;
  customPermissions?: Partial<RolePermissionsMap>;
}

export interface StaffInvitation {
  id: string;
  envMode: EnvironmentMode;
  branchId: string;
  email: string;
  fullName: string;
  roleKey: StaffRoleKey;
  inviteCode: string;
  expiresAt: string;
  acceptedAt?: string;
}

export interface AuditLog {
  id: string;
  envMode: EnvironmentMode;
  branchId: string;
  actorUserId?: string;
  actorName: string;
  action: string;
  module: AppModule;
  targetId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface MenuCategory {
  id: string;
  envMode: EnvironmentMode;
  branchId: string;
  parentId?: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface KdsStation {
  id: string;
  envMode: EnvironmentMode;
  branchId: string;
  name: string;
  code: string;
  sortOrder: number;
  isActive: boolean;
}

export interface ProductVariant {
  id: string;
  productId: string;
  name: string;
  priceDelta: number;
  skuSuffix?: string;
  isDefault: boolean;
}

export interface ModifierOption {
  id: string;
  groupId: string;
  name: string;
  priceDelta: number;
  ingredientId?: string;
  ingredientQtyDelta?: number;
  sortOrder: number;
}

export interface ModifierGroup {
  id: string;
  envMode: EnvironmentMode;
  branchId: string;
  name: string;
  selectionType: 'single' | 'multiple';
  isRequired: boolean;
  options: ModifierOption[];
}

export interface Product {
  id: string;
  envMode: EnvironmentMode;
  branchId: string;
  categoryId: string;
  kdsStationId: string;
  sku: string;
  barcode?: string;
  name: string;
  description: string;
  imageUrl?: string;
  basePrice: number;
  isFeatured: boolean;
  isAvailable: boolean;
  manualUnavailable: boolean;
  unavailableReason?: string;
  taxProfileId?: string;
  variants: ProductVariant[];
  modifierGroupIds: string[];
}

export interface Ingredient {
  id: string;
  envMode: EnvironmentMode;
  branchId: string;
  categoryName: string;
  barcode?: string;
  name: string;
  purchaseUnit: string;
  recipeUnit: string;
  conversionRatio: number; // 1 purchaseUnit = conversionRatio recipeUnits
  currentStock: number; // stored in recipeUnit
  reservedStock: number; // stored in recipeUnit
  reorderPoint: number; // stored in recipeUnit
  unitCost: number; // cost per recipeUnit in PHP
  isActive: boolean;
}

export interface RecipeItem {
  id: string;
  recipeId: string;
  ingredientId: string;
  quantity: number; // in recipeUnit
  unit: string;
}

export interface Recipe {
  id: string;
  envMode: EnvironmentMode;
  branchId: string;
  productId: string;
  variantId?: string;
  instructions: string;
  yieldQty: number;
  yieldUnit: string;
  wasteFactorPercent: number;
  items: RecipeItem[];
}

export interface InventoryMovement {
  id: string;
  envMode: EnvironmentMode;
  branchId: string;
  ingredientId: string;
  movementType: 'stock_in' | 'stock_out' | 'adjustment' | 'reserve' | 'release' | 'consume' | 'waste';
  quantityDelta: number;
  balanceAfter: number;
  unitCost: number;
  referenceType?: string;
  referenceId?: string;
  reason?: string;
  createdBy: string;
  createdAt: string;
}

export interface StockReservation {
  id: string;
  envMode: EnvironmentMode;
  branchId: string;
  orderId: string;
  ingredientId: string;
  quantity: number;
  status: 'active' | 'consumed' | 'released';
  createdAt: string;
}

export interface DiningZone {
  id: string;
  envMode: EnvironmentMode;
  branchId: string;
  name: string;
  sortOrder: number;
}

export interface DiningTable {
  id: string;
  envMode: EnvironmentMode;
  branchId: string;
  zoneId: string;
  tableNumber: string;
  seats: number;
  posX: number;
  posY: number;
  width: number;
  height: number;
  shape: 'square' | 'round' | 'rectangle';
  status: TableStatus;
  qrToken: string;
  mergedIntoTableId?: string;
}

export interface TableCartItem {
  id: string;
  tableId: string;
  productId: string;
  variantId?: string;
  guestLabel: string;
  quantity: number;
  selectedModifiers: SelectedModifier[];
  notes?: string;
  unitPrice: number;
}

export interface TableServiceRequest {
  id: string;
  envMode: EnvironmentMode;
  branchId: string;
  tableId: string;
  requestType: 'call_waiter' | 'request_bill';
  status: 'open' | 'acknowledged' | 'resolved';
  notes?: string;
  createdAt: string;
}

export interface SelectedModifier {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceDelta: number;
  ingredientId?: string;
  ingredientQtyDelta?: number;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  variantId?: string;
  kdsStationId: string;
  productName: string;
  variantName?: string;
  quantity: number;
  unitPrice: number;
  modifiers: SelectedModifier[];
  notes?: string;
  unitCostSnapshot: number;
  lineTotal: number;
  kdsStatus: KdsTicketStatus;
  prepStartedAt?: string;
  prepReadyAt?: string;
  assignedStaffName?: string;
}

export interface Order {
  id: string;
  envMode: EnvironmentMode;
  branchId: string;
  orderNumber: string;
  queueNumber: string;
  channel: OrderChannel;
  orderType: OrderType;
  tableId?: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  deliveryNotes?: string;
  deliveryFee: number;
  subtotal: number;
  discountTotal: number;
  discountReason?: string;
  taxTotal: number;
  totalAmount: number;
  isPriority: boolean;
  orderNotes?: string;
  idempotencyKey: string;
  trackingToken: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
}

export interface PaymentRecord {
  id: string;
  envMode: EnvironmentMode;
  branchId: string;
  orderId: string;
  method: PaymentMethod;
  amount: number;
  referenceNumber?: string;
  proofUrl?: string;
  status: 'pending_verification' | 'verified' | 'rejected' | 'refunded';
  verifiedByName?: string;
  verifiedAt?: string;
  rejectionReason?: string;
  idempotencyKey: string;
  createdAt: string;
}

export interface DeliveryRecord {
  id: string;
  envMode: EnvironmentMode;
  branchId: string;
  orderId: string;
  riderId?: string;
  riderName?: string;
  deliveryStatus: DeliveryStatus;
  customerName: string;
  customerPhone: string;
  address: string;
  landmark?: string;
  deliveryInstructions?: string;
  deliveryFee: number;
  otpCode?: string;
  riderNotes?: string;
  failedReason?: string;
  assignedAt?: string;
  deliveredAt?: string;
}

export interface CashDrawer {
  id: string;
  envMode: EnvironmentMode;
  branchId: string;
  name: string;
  isActive: boolean;
}

export interface CashDrawerMovement {
  id: string;
  shiftId: string;
  type: 'cash_in' | 'cash_out';
  amount: number;
  reason: string;
  createdBy: string;
  createdAt: string;
}

export interface CashDrawerShift {
  id: string;
  envMode: EnvironmentMode;
  branchId: string;
  drawerId: string;
  cashierId: string;
  cashierName: string;
  status: 'open' | 'pending_approval' | 'closed';
  openingCash: number;
  cashSalesExpected: number;
  cashInTotal: number;
  cashOutTotal: number;
  expectedCash: number;
  actualCash?: number;
  variance?: number;
  denominations?: Record<string, number>;
  blindCount: boolean;
  approvedByName?: string;
  openedAt: string;
  closedAt?: string;
  notes?: string;
  movements: CashDrawerMovement[];
}

export interface PrinterConfig {
  id: string;
  envMode: EnvironmentMode;
  branchId: string;
  name: string;
  target: 'receipt' | 'kitchen' | 'delivery';
  paperSize: '58mm' | '80mm' | 'A4' | 'Letter';
  bridgeUrl?: string;
  isDefault: boolean;
  isActive: boolean;
}

export interface InAppNotification {
  id: string;
  envMode: EnvironmentMode;
  branchId: string;
  targetRole?: StaffRoleKey;
  category: 'low_stock' | 'new_order' | 'order_update' | 'approval' | 'cash' | 'table_service' | 'system';
  title: string;
  message: string;
  referenceId?: string;
  isRead: boolean;
  createdAt: string;
}
