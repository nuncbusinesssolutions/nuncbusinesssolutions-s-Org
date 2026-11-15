import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  AppModule,
  BusinessSettings,
  CashDrawerShift,
  ChannelPolicy,
  DeliveryStatus,
  DiningTable,
  EnvironmentMode,
  Ingredient,
  KdsTicketStatus,
  Order,
  OrderChannel,
  OrderType,
  PaymentMethod,
  PermissionAction,
  Product,
  Recipe,
  SelectedModifier,
  StaffRoleKey,
  TableCartItem,
  TaxProfile,
  UserProfile,
} from '../types/cafe';
import {
  DemoState,
  demoAdvanceKdsItem,
  demoAssignRoleSwitch,
  demoCancelOrder,
  demoCloseShift,
  demoConfirmPendingOrder,
  demoPlaceOrder,
  demoRecordAndVerifyPayment,
  demoRefundPayment,
  demoUpdateDeliveryStatus,
  demoVerifyPayment,
  loadDemoState,
  recomputeDemoProductAvailability,
  resetDemoState,
  saveDemoState,
} from '../services/demoStore';
import {
  createEmptyProductionState,
  fetchProductionSnapshot,
  loadUserPermissionOverrides,
  subscribeProductionRealtime,
} from '../services/productionService';
import { getSupabaseClient, isSupabaseConfigured } from '../services/supabaseClient';
import { hasModulePermission, round2 } from '../lib/businessLogic';

interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

interface PlaceOrderInput {
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

interface AppContextValue {
  envMode: EnvironmentMode;
  setEnvMode: (mode: EnvironmentMode) => void;
  isOnline: boolean;
  supabaseReady: boolean;
  isLoadingData: boolean;
  dataError: string | null;
  currentUser: UserProfile | null;
  cafeState: DemoState;
  toasts: ToastMessage[];
  dismissToast: (id: string) => void;
  notify: (type: 'success' | 'error' | 'info', text: string) => void;
  can: (module: AppModule, action: PermissionAction) => boolean;
  switchDemoRole: (roleKey: StaffRoleKey) => void;
  resetDemo: () => void;
  refreshProductionData: () => Promise<void>;
  // Production Supabase auth & bootstrap
  signInProduction: (email: string, password: string) => Promise<void>;
  setupInitialOwnerProduction: (params: {
    fullName: string;
    email: string;
    password: string;
    businessName: string;
    branchName?: string;
    address?: string;
    phone?: string;
  }) => Promise<void>;
  signOut: () => Promise<void>;
  // Core operational actions
  placeOrder: (input: PlaceOrderInput) => Promise<Order>;
  confirmPendingOrder: (orderId: string) => Promise<void>;
  completeOrder: (orderId: string) => Promise<void>;
  cancelOrder: (orderId: string, reason: string) => Promise<void>;
  advanceKdsItem: (orderId: string, itemId: string, nextStatus: KdsTicketStatus) => Promise<void>;
  recordPayment: (params: {
    orderId: string;
    method: PaymentMethod;
    amount: number;
    referenceNumber?: string;
  }) => Promise<void>;
  verifyPayment: (paymentId: string, approve: boolean, reason?: string) => Promise<void>;
  refundPayment: (paymentId: string, reason: string) => Promise<void>;
  stockAdjustIngredient: (
    ingredientId: string,
    deltaInRecipeUnits: number,
    type: 'stock_in' | 'stock_out' | 'adjustment',
    reason: string
  ) => Promise<void>;
  overrideProductAvailability: (productId: string, available: boolean, reason: string) => Promise<void>;
  createProduct: (product: Omit<Product, 'id' | 'envMode' | 'branchId' | 'isAvailable' | 'manualUnavailable'>) => Promise<void>;
  createIngredient: (ingredient: Omit<Ingredient, 'id' | 'envMode' | 'branchId' | 'reservedStock' | 'isActive'>) => Promise<void>;
  saveRecipeForProduct: (recipe: Omit<Recipe, 'id' | 'envMode' | 'branchId'>) => Promise<void>;
  moveTableOnFloor: (tableId: string, posX: number, posY: number) => Promise<void>;
  updateTableStatus: (tableId: string, status: DiningTable['status']) => Promise<void>;
  transferTableOrder: (orderId: string, targetTableId: string) => Promise<void>;
  addToTableCart: (tableId: string, item: Omit<TableCartItem, 'id' | 'tableId'>, qrToken?: string) => Promise<void>;
  clearTableCart: (tableId: string) => Promise<void>;
  sendTableServiceRequest: (
    tableId: string,
    requestType: 'call_waiter' | 'request_bill',
    notes?: string,
    qrToken?: string
  ) => Promise<void>;
  resolveServiceRequest: (requestId: string) => Promise<void>;
  assignDeliveryRider: (deliveryId: string, riderId: string) => Promise<void>;
  updateDeliveryStatus: (deliveryId: string, status: DeliveryStatus, otpInput?: string, notes?: string) => Promise<void>;
  openCashShift: (drawerId: string, openingCash: number, blindCount: boolean) => Promise<void>;
  addCashMovement: (shiftId: string, type: 'cash_in' | 'cash_out', amount: number, reason: string) => Promise<void>;
  closeCashShift: (shiftId: string, denominations: Record<string, number>, notes?: string) => Promise<void>;
  approveCashShift: (shiftId: string) => Promise<void>;
  updateBusinessSettings: (patch: Partial<BusinessSettings>) => Promise<void>;
  updateTaxProfile: (profile: TaxProfile) => Promise<void>;
  updateChannelPolicy: (policy: ChannelPolicy) => Promise<void>;
  inviteStaffMember: (fullName: string, email: string, roleKey: Exclude<StaffRoleKey, 'super_admin'>) => Promise<void>;
  togglePermissionOverride: (userId: string, module: AppModule, action: PermissionAction, value: boolean) => Promise<void>;
  markNotificationRead: (notifId: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const ENV_MODE_KEY = 'kapeos_env_mode';

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [envMode, setEnvModeState] = useState<EnvironmentMode>(() => {
    const saved = localStorage.getItem(ENV_MODE_KEY);
    if (saved === 'production' || saved === 'demo') return saved;
    return isSupabaseConfigured ? 'production' : 'demo';
  });

  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [demoState, setDemoState] = useState<DemoState>(() => loadDemoState());
  const [prodState, setProdState] = useState<DemoState>(() => createEmptyProductionState());
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [demoRole, setDemoRole] = useState<StaffRoleKey>('super_admin');
  const [prodUser, setProdUser] = useState<UserProfile | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const notify = useCallback((type: ToastMessage['type'], text: string) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      notify('success', 'Connection restored. Real-time sync active.');
    };
    const handleOffline = () => {
      setIsOnline(false);
      notify('error', 'Internet connection lost. Transactions paused to prevent data loss.');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [notify]);

  const setEnvMode = useCallback((mode: EnvironmentMode) => {
    localStorage.setItem(ENV_MODE_KEY, mode);
    setEnvModeState(mode);
  }, []);

  const refreshProductionData = useCallback(async () => {
    if (envMode !== 'production' || !isSupabaseConfigured) return;
    const sb = getSupabaseClient();
    if (!sb) return;
    setIsLoadingData(true);
    setDataError(null);
    try {
      const snapshot = await fetchProductionSnapshot(sb, prodUser);
      setProdState(snapshot);
    } catch (err) {
      const msg = (err as Error).message || 'Failed to sync Production data from Supabase.';
      setDataError(msg);
    } finally {
      setIsLoadingData(false);
    }
  }, [envMode, prodUser]);

  // Load Supabase session & permission overrides in Production mode
  useEffect(() => {
    if (envMode !== 'production' || !isSupabaseConfigured) {
      setProdUser(null);
      setProdState(createEmptyProductionState());
      setDataError(null);
      return;
    }
    const sb = getSupabaseClient();
    if (!sb) return;

    const loadProfile = async (userId: string) => {
      const { data } = await sb
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (data) {
        const customPermissions = await loadUserPermissionOverrides(sb, userId);
        setProdUser({
          id: data.id,
          envMode: data.env_mode,
          branchId: data.branch_id,
          fullName: data.full_name,
          email: data.email,
          phone: data.phone,
          roleKey: data.role_key,
          isActive: data.is_active,
          sessionTimeoutMinutes: data.session_timeout_minutes,
          customPermissions,
        });
      }
    };

    sb.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        loadProfile(data.session.user.id);
      }
    });

    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setProdUser(null);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, [envMode]);

  // Hydrate & subscribe to Supabase Realtime in Production mode
  useEffect(() => {
    if (envMode !== 'production' || !isSupabaseConfigured) return;
    const sb = getSupabaseClient();
    if (!sb) return;
    void refreshProductionData();

    if (!prodState.branch.id) return;
    const unsub = subscribeProductionRealtime(sb, prodState.branch.id, () => {
      void refreshProductionData();
    });
    return unsub;
  }, [envMode, prodUser?.id, prodState.branch.id, refreshProductionData]);

  const cafeState: DemoState = envMode === 'production' ? prodState : demoState;

  const currentUser: UserProfile | null = useMemo(() => {
    if (envMode === 'demo') {
      return demoAssignRoleSwitch(demoState, demoRole);
    }
    return prodUser;
  }, [envMode, demoState, demoRole, prodUser]);

  const can = useCallback(
    (module: AppModule, action: PermissionAction) => hasModulePermission(currentUser, module, action),
    [currentUser]
  );

  const requireOnlineGuard = useCallback(() => {
    if (!isOnline) {
      throw new Error('Offline detected: transactional operations are disabled until connection is restored.');
    }
  }, [isOnline]);

  const requireProdClient = useCallback(() => {
    const sb = getSupabaseClient();
    if (!sb) throw new Error('Supabase client unavailable.');
    return sb;
  }, []);

  const switchDemoRole = useCallback(
    (roleKey: StaffRoleKey) => {
      setDemoRole(roleKey);
      notify('info', `Switched Demo view to ${roleKey.replace('_', ' ')}`);
    },
    [notify]
  );

  const resetDemo = useCallback(() => {
    const fresh = resetDemoState();
    setDemoState(fresh);
    notify('info', 'Demo environment reset to clean baseline.');
  }, [notify]);

  const signInProduction = useCallback(
    async (email: string, password: string) => {
      requireOnlineGuard();
      const sb = requireProdClient();
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      notify('success', 'Signed in to Production.');
    },
    [notify, requireOnlineGuard, requireProdClient]
  );

  const setupInitialOwnerProduction = useCallback(
    async (params: {
      fullName: string;
      email: string;
      password: string;
      businessName: string;
      branchName?: string;
      address?: string;
      phone?: string;
    }) => {
      requireOnlineGuard();
      const sb = requireProdClient();
      const { data, error } = await sb.functions.invoke('setup-initial-owner', {
        body: params,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await sb.auth.signInWithPassword({ email: params.email, password: params.password });
      await refreshProductionData();
      notify('success', 'Initial Super Admin & branch provisioned.');
    },
    [notify, refreshProductionData, requireOnlineGuard, requireProdClient]
  );

  const signOut = useCallback(async () => {
    if (envMode === 'production') {
      const sb = getSupabaseClient();
      if (sb) await sb.auth.signOut();
      setProdUser(null);
      setProdState(createEmptyProductionState());
    }
    notify('info', 'Signed out.');
  }, [envMode, notify]);

  const commitDemo = useCallback((updater: (prev: DemoState) => DemoState) => {
    setDemoState((prev) => {
      const next = updater(prev);
      saveDemoState(next);
      return next;
    });
  }, []);

  const placeOrder = useCallback(
    async (input: PlaceOrderInput): Promise<Order> => {
      requireOnlineGuard();
      const idempotencyKey = `ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      if (envMode === 'production') {
        const sb = requireProdClient();
        const branchId = currentUser?.branchId ?? prodState.branch.id;
        if (!branchId) throw new Error('Active branch context required.');
        const { data, error } = await sb.rpc('place_order_transactional', {
          p_env: 'production',
          p_branch_id: branchId,
          p_channel: input.channel,
          p_order_type: input.orderType,
          p_table_id: input.tableId ?? null,
          p_customer_name: input.customerName ?? null,
          p_customer_phone: input.customerPhone ?? null,
          p_delivery_address: input.deliveryAddress ?? null,
          p_delivery_notes: input.deliveryNotes ?? null,
          p_delivery_fee: input.deliveryFee ?? 0,
          p_discount_total: input.discountTotal ?? 0,
          p_discount_reason: input.discountReason ?? null,
          p_order_notes: input.orderNotes ?? null,
          p_is_priority: input.isPriority ?? false,
          p_idempotency_key: idempotencyKey,
          p_items: input.items,
        });
        if (error) throw error;
        await refreshProductionData();
        notify('success', `Order ${data.order_number} placed.`);
        return {
          id: data.id,
          envMode: data.env_mode,
          branchId: data.branch_id,
          orderNumber: data.order_number,
          queueNumber: data.queue_number,
          channel: data.channel,
          orderType: data.order_type,
          tableId: data.table_id ?? undefined,
          status: data.status,
          paymentStatus: data.payment_status,
          customerName: data.customer_name ?? undefined,
          customerPhone: data.customer_phone ?? undefined,
          deliveryAddress: data.delivery_address ?? undefined,
          deliveryNotes: data.delivery_notes ?? undefined,
          deliveryFee: Number(data.delivery_fee),
          subtotal: Number(data.subtotal),
          discountTotal: Number(data.discount_total),
          discountReason: data.discount_reason ?? undefined,
          taxTotal: Number(data.tax_total),
          totalAmount: Number(data.total_amount),
          isPriority: data.is_priority,
          orderNotes: data.order_notes ?? undefined,
          idempotencyKey: data.idempotency_key,
          trackingToken: data.tracking_token,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
          items: [],
        };
      }

      let createdOrder!: Order;
      setDemoState((prev) => {
        const res = demoPlaceOrder(prev, {
          ...input,
          idempotencyKey,
          actorName: currentUser?.fullName ?? input.customerName ?? 'Guest',
        });
        createdOrder = res.order;
        return res.state;
      });
      notify('success', `Order ${createdOrder.orderNumber} (${createdOrder.queueNumber}) created.`);
      return createdOrder;
    },
    [currentUser, envMode, notify, prodState.branch.id, refreshProductionData, requireOnlineGuard, requireProdClient]
  );

  const confirmPendingOrder = useCallback(
    async (orderId: string) => {
      requireOnlineGuard();
      if (!can('orders', 'approve')) throw new Error('Permission denied: orders.approve required.');
      if (envMode === 'production') {
        const sb = requireProdClient();
        const { error } = await sb.rpc('confirm_pending_order_transactional', { p_order_id: orderId });
        if (error) throw error;
        await refreshProductionData();
        notify('success', 'Order confirmed, stock reserved, and routed to KDS.');
        return;
      }
      setDemoState((prev) => demoConfirmPendingOrder(prev, orderId, currentUser?.fullName ?? 'Staff'));
      notify('success', 'Order confirmed, stock reserved, and routed to KDS.');
    },
    [can, currentUser, envMode, notify, refreshProductionData, requireOnlineGuard, requireProdClient]
  );

  const completeOrder = useCallback(
    async (orderId: string) => {
      requireOnlineGuard();
      if (envMode === 'production') {
        const sb = requireProdClient();
        const { error } = await sb.rpc('complete_order_transactional', { p_order_id: orderId });
        if (error) throw error;
        await refreshProductionData();
        notify('success', 'Order marked completed.');
        return;
      }
      commitDemo((prev) => {
        const next: DemoState = structuredClone(prev);
        const ord = next.orders.find((o) => o.id === orderId);
        if (!ord) return prev;
        ord.status = 'completed';
        ord.updatedAt = new Date().toISOString();
        ord.items.forEach((i) => {
          if (i.kdsStatus === 'ready') i.kdsStatus = 'bumped';
        });
        if (ord.tableId) {
          const otherActive = next.orders.some(
            (o) => o.id !== ord.id && o.tableId === ord.tableId && !['completed', 'cancelled'].includes(o.status)
          );
          if (!otherActive) {
            const tbl = next.tables.find((t) => t.id === ord.tableId);
            if (tbl) tbl.status = 'available';
          }
        }
        return next;
      });
      notify('success', 'Order marked completed.');
    },
    [commitDemo, envMode, notify, prodState.orders, refreshProductionData, requireOnlineGuard, requireProdClient]
  );

  const cancelOrder = useCallback(
    async (orderId: string, reason: string) => {
      requireOnlineGuard();
      if (!reason.trim()) throw new Error('Cancellation reason is required.');
      const ord = cafeState.orders.find((o) => o.id === orderId);
      const prepStarted = ord && ['preparing', 'ready', 'completed'].includes(ord.status);
      if (prepStarted && !can('orders', 'approve')) {
        throw new Error('Manager approval required to cancel after preparation started.');
      }

      if (envMode === 'production') {
        const sb = requireProdClient();
        const { error } = await sb.rpc('cancel_order_transactional', {
          p_order_id: orderId,
          p_reason: reason,
        });
        if (error) throw error;
        await refreshProductionData();
        notify('info', 'Order cancelled with audit trail.');
        return;
      }

      setDemoState((prev) => demoCancelOrder(prev, orderId, reason, currentUser?.fullName ?? 'Staff'));
      notify('info', 'Order cancelled with audit trail.');
    },
    [cafeState.orders, can, currentUser, envMode, notify, refreshProductionData, requireOnlineGuard, requireProdClient]
  );

  const advanceKdsItem = useCallback(
    async (orderId: string, itemId: string, nextStatus: KdsTicketStatus) => {
      requireOnlineGuard();
      if (envMode === 'production') {
        const sb = requireProdClient();
        const { error } = await sb.rpc('advance_kds_item_status', {
          p_order_item_id: itemId,
          p_next_status: nextStatus,
        });
        if (error) throw error;
        await refreshProductionData();
        return;
      }
      setDemoState((prev) =>
        demoAdvanceKdsItem(prev, orderId, itemId, nextStatus, currentUser?.fullName ?? 'Barista')
      );
    },
    [currentUser, envMode, refreshProductionData, requireOnlineGuard, requireProdClient]
  );

  const recordPayment = useCallback(
    async (params: { orderId: string; method: PaymentMethod; amount: number; referenceNumber?: string }) => {
      requireOnlineGuard();
      const key = `pay_${params.orderId}_${Date.now()}`;
      if (envMode === 'production') {
        const sb = requireProdClient();
        const { error } = await sb.rpc('record_payment_transactional', {
          p_order_id: params.orderId,
          p_method: params.method,
          p_amount: params.amount,
          p_reference_number: params.referenceNumber ?? null,
          p_proof_url: null,
          p_idempotency_key: key,
        });
        if (error) throw error;
        await refreshProductionData();
        notify(
          params.method === 'cash' ? 'success' : 'info',
          params.method === 'cash'
            ? 'Cash payment recorded.'
            : 'Digital payment submitted for manual verification.'
        );
        return;
      }

      setDemoState((prev) =>
        demoRecordAndVerifyPayment(prev, {
          ...params,
          actorName: currentUser?.fullName ?? 'Staff',
          idempotencyKey: key,
        })
      );
      notify(
        params.method === 'cash' ? 'success' : 'info',
        params.method === 'cash'
          ? 'Cash payment recorded.'
          : 'Digital payment submitted for manual verification.'
      );
    },
    [currentUser, envMode, notify, refreshProductionData, requireOnlineGuard, requireProdClient]
  );

  const verifyPayment = useCallback(
    async (paymentId: string, approve: boolean, reason?: string) => {
      requireOnlineGuard();
      if (!can('payments', 'approve')) throw new Error('Permission denied: payments.approve required.');
      if (envMode === 'production') {
        const sb = requireProdClient();
        const { error } = await sb.rpc('verify_payment_transactional', {
          p_payment_id: paymentId,
          p_approve: approve,
          p_rejection_reason: reason ?? null,
        });
        if (error) throw error;
        await refreshProductionData();
        notify(approve ? 'success' : 'info', approve ? 'Payment verified.' : 'Payment rejected.');
        return;
      }
      setDemoState((prev) =>
        demoVerifyPayment(prev, paymentId, approve, currentUser?.fullName ?? 'Manager', reason)
      );
      notify(approve ? 'success' : 'info', approve ? 'Payment verified.' : 'Payment rejected.');
    },
    [can, currentUser, envMode, notify, refreshProductionData, requireOnlineGuard, requireProdClient]
  );

  const refundPayment = useCallback(
    async (paymentId: string, reason: string) => {
      requireOnlineGuard();
      if (!can('payments', 'approve')) throw new Error('Permission denied: payments.approve required for refunds.');
      if (!reason.trim()) throw new Error('Refund reason is required.');

      if (envMode === 'production') {
        const sb = requireProdClient();
        const { error } = await sb.rpc('refund_payment_transactional', {
          p_payment_id: paymentId,
          p_reason: reason.trim(),
        });
        if (error) throw error;
        await refreshProductionData();
        notify('info', 'Payment refunded and logged.');
        return;
      }

      setDemoState((prev) =>
        demoRefundPayment(prev, paymentId, currentUser?.fullName ?? 'Manager', reason)
      );
      notify('info', 'Payment refunded and logged.');
    },
    [can, currentUser, envMode, notify, refreshProductionData, requireOnlineGuard, requireProdClient]
  );

  const stockAdjustIngredient = useCallback(
    async (
      ingredientId: string,
      deltaInRecipeUnits: number,
      type: 'stock_in' | 'stock_out' | 'adjustment',
      reason: string
    ) => {
      requireOnlineGuard();
      if (!can('inventory', 'edit')) throw new Error('Permission denied: inventory.edit required.');
      if (envMode === 'production') {
        const sb = requireProdClient();
        const { error } = await sb.rpc('stock_adjust_ingredient_transactional', {
          p_ingredient_id: ingredientId,
          p_delta: deltaInRecipeUnits,
          p_type: type,
          p_reason: reason,
        });
        if (error) throw error;
        await refreshProductionData();
        notify('success', 'Inventory balance updated & menu availability synced.');
        return;
      }
      commitDemo((prev) => {
        const next: DemoState = structuredClone(prev);
        const ing = next.ingredients.find((i) => i.id === ingredientId);
        if (!ing) return prev;
        const appliedDelta = type === 'stock_out' ? -Math.abs(deltaInRecipeUnits) : deltaInRecipeUnits;
        const newBal = round2(ing.currentStock + appliedDelta);
        if (newBal < ing.reservedStock) {
          throw new Error(`Cannot reduce stock below active reserved quantity (${ing.reservedStock} ${ing.recipeUnit}).`);
        }
        ing.currentStock = newBal;
        const now = new Date().toISOString();
        next.movements.unshift({
          id: `mov_${Date.now()}`,
          envMode: 'demo',
          branchId: next.branch.id,
          ingredientId,
          movementType: type,
          quantityDelta: appliedDelta,
          balanceAfter: newBal,
          unitCost: ing.unitCost,
          reason,
          createdBy: currentUser?.fullName ?? 'Staff',
          createdAt: now,
        });
        recomputeDemoProductAvailability(next);
        return next;
      });
      notify('success', 'Inventory balance updated & menu availability synced.');
    },
    [can, commitDemo, currentUser, envMode, notify, refreshProductionData, requireOnlineGuard, requireProdClient]
  );

  const overrideProductAvailability = useCallback(
    async (productId: string, available: boolean, reason: string) => {
      requireOnlineGuard();
      if (!reason.trim()) throw new Error('Override reason is required for audit compliance.');
      if (envMode === 'production') {
        const sb = requireProdClient();
        const { error } = await sb.rpc('override_product_availability_transactional', {
          p_product_id: productId,
          p_available: available,
          p_reason: reason.trim(),
        });
        if (error) throw error;
        await refreshProductionData();
        notify('info', 'Product availability updated.');
        return;
      }
      commitDemo((prev) => {
        const next: DemoState = structuredClone(prev);
        const prod = next.products.find((p) => p.id === productId);
        if (!prod) return prev;
        prod.manualUnavailable = !available;
        prod.unavailableReason = available ? undefined : reason;
        prod.isAvailable = available;
        if (available) recomputeDemoProductAvailability(next);
        next.auditLogs.unshift({
          id: `aud_${Date.now()}`,
          envMode: 'demo',
          branchId: next.branch.id,
          actorName: currentUser?.fullName ?? 'Staff',
          action: available ? 'product_availability_restored' : 'product_marked_unavailable',
          module: 'menu',
          targetId: productId,
          reason,
          createdAt: new Date().toISOString(),
        });
        return next;
      });
      notify('info', 'Product availability updated.');
    },
    [commitDemo, currentUser, envMode, notify, refreshProductionData, requireOnlineGuard, requireProdClient]
  );

  const createProduct = useCallback(
    async (prodInput: Omit<Product, 'id' | 'envMode' | 'branchId' | 'isAvailable' | 'manualUnavailable'>) => {
      requireOnlineGuard();
      if (envMode === 'production') {
        const sb = requireProdClient();
        const branchId = currentUser?.branchId ?? prodState.branch.id;
        if (!branchId) throw new Error('Active branch context required.');
        const { data: inserted, error } = await sb
          .from('products')
          .insert({
            env_mode: 'production',
            branch_id: branchId,
            category_id: prodInput.categoryId,
            kds_station_id: prodInput.kdsStationId,
            sku: prodInput.sku,
            barcode: prodInput.barcode || null,
            name: prodInput.name,
            description: prodInput.description,
            image_url: prodInput.imageUrl || null,
            base_price: prodInput.basePrice,
            is_featured: prodInput.isFeatured,
          })
          .select()
          .single();
        if (error) throw error;
        const variants =
          prodInput.variants.length > 0
            ? prodInput.variants.map((v) => ({
                product_id: inserted.id,
                name: v.name,
                price_delta: v.priceDelta,
                sku_suffix: v.skuSuffix || null,
                is_default: v.isDefault,
              }))
            : [{ product_id: inserted.id, name: 'Standard', price_delta: 0, is_default: true }];
        await sb.from('product_variants').insert(variants);
        await refreshProductionData();
        notify('success', `Product "${prodInput.name}" added to menu.`);
        return;
      }

      commitDemo((prev) => {
        const next: DemoState = structuredClone(prev);
        if (prodInput.barcode && next.products.some((p) => p.barcode === prodInput.barcode)) {
          throw new Error(`Duplicate barcode ${prodInput.barcode} is already assigned.`);
        }
        const id = `prd_${Date.now()}`;
        next.products.push({
          ...prodInput,
          id,
          envMode: 'demo',
          branchId: next.branch.id,
          isAvailable: true,
          manualUnavailable: false,
          variants:
            prodInput.variants.length > 0
              ? prodInput.variants.map((v) => ({ ...v, productId: id }))
              : [{ id: `var_${Date.now()}`, productId: id, name: 'Standard', priceDelta: 0, isDefault: true }],
        });
        return next;
      });
      notify('success', `Product "${prodInput.name}" added to menu.`);
    },
    [commitDemo, currentUser?.branchId, envMode, notify, prodState.branch.id, refreshProductionData, requireOnlineGuard, requireProdClient]
  );

  const createIngredient = useCallback(
    async (ingInput: Omit<Ingredient, 'id' | 'envMode' | 'branchId' | 'reservedStock' | 'isActive'>) => {
      requireOnlineGuard();
      if (envMode === 'production') {
        const sb = requireProdClient();
        const branchId = currentUser?.branchId ?? prodState.branch.id;
        if (!branchId) throw new Error('Active branch context required.');
        const { error } = await sb.from('ingredients').insert({
          env_mode: 'production',
          branch_id: branchId,
          category_name: ingInput.categoryName,
          barcode: ingInput.barcode || null,
          name: ingInput.name,
          purchase_unit: ingInput.purchaseUnit,
          recipe_unit: ingInput.recipeUnit,
          conversion_ratio: ingInput.conversionRatio,
          current_stock: ingInput.currentStock,
          reorder_point: ingInput.reorderPoint,
          unit_cost: ingInput.unitCost,
        });
        if (error) throw error;
        await refreshProductionData();
        notify('success', `Ingredient "${ingInput.name}" created.`);
        return;
      }

      commitDemo((prev) => {
        const next: DemoState = structuredClone(prev);
        if (ingInput.barcode && next.ingredients.some((i) => i.barcode === ingInput.barcode)) {
          throw new Error(`Duplicate barcode ${ingInput.barcode} is already assigned.`);
        }
        next.ingredients.push({
          ...ingInput,
          id: `ing_${Date.now()}`,
          envMode: 'demo',
          branchId: next.branch.id,
          reservedStock: 0,
          isActive: true,
        });
        return next;
      });
      notify('success', `Ingredient "${ingInput.name}" created.`);
    },
    [commitDemo, currentUser?.branchId, envMode, notify, prodState.branch.id, refreshProductionData, requireOnlineGuard, requireProdClient]
  );

  const saveRecipeForProduct = useCallback(
    async (recInput: Omit<Recipe, 'id' | 'envMode' | 'branchId'>) => {
      requireOnlineGuard();
      if (envMode === 'production') {
        const sb = requireProdClient();
        const branchId = currentUser?.branchId ?? prodState.branch.id;
        if (!branchId) throw new Error('Active branch context required.');
        const existing = prodState.recipes.find(
          (r) => r.productId === recInput.productId && r.variantId === recInput.variantId
        );
        let recipeId = existing?.id;
        if (recipeId) {
          const { error } = await sb
            .from('recipes')
            .update({
              instructions: recInput.instructions,
              yield_qty: recInput.yieldQty,
              yield_unit: recInput.yieldUnit,
              waste_factor_percent: recInput.wasteFactorPercent,
            })
            .eq('id', recipeId);
          if (error) throw error;
          await sb.from('recipe_items').delete().eq('recipe_id', recipeId);
        } else {
          const { data: inserted, error } = await sb
            .from('recipes')
            .insert({
              env_mode: 'production',
              branch_id: branchId,
              product_id: recInput.productId,
              variant_id: recInput.variantId ?? null,
              instructions: recInput.instructions,
              yield_qty: recInput.yieldQty,
              yield_unit: recInput.yieldUnit,
              waste_factor_percent: recInput.wasteFactorPercent,
            })
            .select()
            .single();
          if (error) throw error;
          recipeId = inserted.id;
        }
        if (recInput.items.length > 0 && recipeId) {
          await sb.from('recipe_items').insert(
            recInput.items.map((it) => ({
              recipe_id: recipeId,
              ingredient_id: it.ingredientId,
              quantity: it.quantity,
              unit: it.unit,
            }))
          );
        }
        await sb.rpc('recompute_product_availability', { p_branch_id: branchId, p_env: 'production' });
        await refreshProductionData();
        notify('success', 'Recipe & unit costing saved.');
        return;
      }

      commitDemo((prev) => {
        const next: DemoState = structuredClone(prev);
        const existingIdx = next.recipes.findIndex(
          (r) => r.productId === recInput.productId && r.variantId === recInput.variantId
        );
        const id = existingIdx >= 0 ? next.recipes[existingIdx].id : `rec_${Date.now()}`;
        const saved: Recipe = {
          ...recInput,
          id,
          envMode: 'demo',
          branchId: next.branch.id,
          items: recInput.items.map((it) => ({ ...it, recipeId: id })),
        };
        if (existingIdx >= 0) next.recipes[existingIdx] = saved;
        else next.recipes.push(saved);
        recomputeDemoProductAvailability(next);
        return next;
      });
      notify('success', 'Recipe & unit costing saved.');
    },
    [commitDemo, currentUser?.branchId, envMode, notify, prodState.branch.id, prodState.recipes, refreshProductionData, requireOnlineGuard, requireProdClient]
  );

  const moveTableOnFloor = useCallback(
    async (tableId: string, posX: number, posY: number) => {
      const nextX = Math.max(8, Math.round(posX));
      const nextY = Math.max(8, Math.round(posY));
      if (envMode === 'production') {
        const sb = requireProdClient();
        await sb.from('dining_tables').update({ pos_x: nextX, pos_y: nextY }).eq('id', tableId);
        await refreshProductionData();
        return;
      }
      commitDemo((prev) => {
        const next: DemoState = structuredClone(prev);
        const tbl = next.tables.find((t) => t.id === tableId);
        if (tbl) {
          tbl.posX = nextX;
          tbl.posY = nextY;
        }
        return next;
      });
    },
    [commitDemo, envMode, refreshProductionData, requireProdClient]
  );

  const updateTableStatus = useCallback(
    async (tableId: string, status: DiningTable['status']) => {
      if (envMode === 'production') {
        const sb = requireProdClient();
        await sb.from('dining_tables').update({ status }).eq('id', tableId);
        await refreshProductionData();
        return;
      }
      commitDemo((prev) => {
        const next: DemoState = structuredClone(prev);
        const tbl = next.tables.find((t) => t.id === tableId);
        if (tbl) tbl.status = status;
        return next;
      });
    },
    [commitDemo, envMode, refreshProductionData, requireProdClient]
  );

  const transferTableOrder = useCallback(
    async (orderId: string, targetTableId: string) => {
      requireOnlineGuard();
      if (envMode === 'production') {
        const sb = requireProdClient();
        const ord = prodState.orders.find((o) => o.id === orderId);
        const oldTableId = ord?.tableId;
        const { error } = await sb
          .from('orders')
          .update({ table_id: targetTableId, updated_at: new Date().toISOString() })
          .eq('id', orderId);
        if (error) throw error;
        await sb.from('dining_tables').update({ status: 'occupied' }).eq('id', targetTableId);
        if (oldTableId) {
          const stillUsed = prodState.orders.some(
            (o) => o.id !== orderId && o.tableId === oldTableId && !['completed', 'cancelled'].includes(o.status)
          );
          if (!stillUsed) {
            await sb.from('dining_tables').update({ status: 'available' }).eq('id', oldTableId);
          }
        }
        await refreshProductionData();
        notify('success', 'Order transferred to new table.');
        return;
      }
      commitDemo((prev) => {
        const next: DemoState = structuredClone(prev);
        const ord = next.orders.find((o) => o.id === orderId);
        if (!ord) return prev;
        const oldTableId = ord.tableId;
        ord.tableId = targetTableId;
        ord.updatedAt = new Date().toISOString();
        const target = next.tables.find((t) => t.id === targetTableId);
        if (target) target.status = 'occupied';
        if (oldTableId) {
          const stillUsed = next.orders.some(
            (o) => o.id !== orderId && o.tableId === oldTableId && !['completed', 'cancelled'].includes(o.status)
          );
          if (!stillUsed) {
            const oldTbl = next.tables.find((t) => t.id === oldTableId);
            if (oldTbl) oldTbl.status = 'available';
          }
        }
        return next;
      });
      notify('success', 'Order transferred to new table.');
    },
    [commitDemo, envMode, notify, prodState.orders, refreshProductionData, requireOnlineGuard, requireProdClient]
  );

  const addToTableCart = useCallback(
    async (tableId: string, item: Omit<TableCartItem, 'id' | 'tableId'>, qrToken?: string) => {
      if (envMode === 'production') {
        const sb = requireProdClient();
        const token = qrToken ?? prodState.tables.find((t) => t.id === tableId)?.qrToken;
        if (!token) throw new Error('Valid table QR token required.');
        const { error } = await sb.rpc('add_qr_table_cart_item', {
          p_qr_token: token,
          p_product_id: item.productId,
          p_variant_id: item.variantId ?? null,
          p_guest_label: item.guestLabel,
          p_quantity: item.quantity,
          p_modifiers: item.selectedModifiers,
          p_notes: item.notes ?? null,
        });
        if (error) throw error;
        return;
      }
      commitDemo((prev) => {
        const next: DemoState = structuredClone(prev);
        const current = next.tableCarts[tableId] ?? [];
        current.push({ ...item, id: `tci_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`, tableId });
        next.tableCarts[tableId] = current;
        return next;
      });
    },
    [commitDemo, envMode, prodState.tables, requireProdClient]
  );

  const clearTableCart = useCallback(
    async (tableId: string) => {
      if (envMode === 'production') return;
      commitDemo((prev) => {
        const next: DemoState = structuredClone(prev);
        next.tableCarts[tableId] = [];
        return next;
      });
    },
    [commitDemo, envMode]
  );

  const sendTableServiceRequest = useCallback(
    async (tableId: string, requestType: 'call_waiter' | 'request_bill', notes?: string, qrToken?: string) => {
      requireOnlineGuard();
      if (envMode === 'production') {
        const sb = requireProdClient();
        const token = qrToken ?? prodState.tables.find((t) => t.id === tableId)?.qrToken;
        if (!token) throw new Error('Valid table QR token required.');
        const { error } = await sb.rpc('create_qr_service_request', {
          p_qr_token: token,
          p_request_type: requestType,
          p_notes: notes ?? null,
        });
        if (error) throw error;
        notify('success', requestType === 'call_waiter' ? 'Waiter notified.' : 'Bill request sent to cashier.');
        return;
      }
      commitDemo((prev) => {
        const next: DemoState = structuredClone(prev);
        const tbl = next.tables.find((t) => t.id === tableId);
        const now = new Date().toISOString();
        next.serviceRequests.unshift({
          id: `sr_${Date.now()}`,
          envMode: 'demo',
          branchId: next.branch.id,
          tableId,
          requestType,
          status: 'open',
          notes,
          createdAt: now,
        });
        next.notifications.unshift({
          id: `notif_${Date.now()}`,
          envMode: 'demo',
          branchId: next.branch.id,
          category: 'table_service',
          title: `${tbl?.tableNumber ?? 'Table'}: ${requestType === 'call_waiter' ? 'Waiter Requested' : 'Bill Requested'}`,
          message: notes || 'Customer requested counter attention via table QR.',
          referenceId: tableId,
          isRead: false,
          createdAt: now,
        });
        return next;
      });
      notify('success', requestType === 'call_waiter' ? 'Waiter notified.' : 'Bill request sent to cashier.');
    },
    [commitDemo, envMode, notify, prodState.tables, requireOnlineGuard, requireProdClient]
  );

  const resolveServiceRequest = useCallback(
    async (requestId: string) => {
      if (envMode === 'production') {
        const sb = requireProdClient();
        await sb.from('table_service_requests').update({ status: 'resolved' }).eq('id', requestId);
        await refreshProductionData();
        return;
      }
      commitDemo((prev) => {
        const next: DemoState = structuredClone(prev);
        const req = next.serviceRequests.find((r) => r.id === requestId);
        if (req) req.status = 'resolved';
        return next;
      });
    },
    [commitDemo, envMode, refreshProductionData, requireProdClient]
  );

  const assignDeliveryRider = useCallback(
    async (deliveryId: string, riderId: string) => {
      requireOnlineGuard();
      if (envMode === 'production') {
        const sb = requireProdClient();
        const rider = prodState.users.find((u) => u.id === riderId);
        if (!rider) throw new Error('Selected rider not found.');
        const { error } = await sb
          .from('deliveries')
          .update({
            rider_id: rider.id,
            rider_name: rider.fullName,
            delivery_status: 'assigned',
            assigned_at: new Date().toISOString(),
          })
          .eq('id', deliveryId);
        if (error) throw error;
        await refreshProductionData();
        notify('success', 'Rider assigned to delivery.');
        return;
      }
      commitDemo((prev) => {
        const next: DemoState = structuredClone(prev);
        const del = next.deliveries.find((d) => d.id === deliveryId);
        const rider = next.users.find((u) => u.id === riderId);
        if (del && rider) {
          del.riderId = rider.id;
          del.riderName = rider.fullName;
          del.deliveryStatus = 'assigned';
          del.assignedAt = new Date().toISOString();
        }
        return next;
      });
      notify('success', 'Rider assigned to delivery.');
    },
    [commitDemo, envMode, notify, prodState.users, refreshProductionData, requireOnlineGuard, requireProdClient]
  );

  const updateDeliveryStatus = useCallback(
    async (deliveryId: string, status: DeliveryStatus, otpInput?: string, notes?: string) => {
      requireOnlineGuard();
      if (envMode === 'production') {
        const sb = requireProdClient();
        const { error } = await sb.rpc('update_delivery_status_transactional', {
          p_delivery_id: deliveryId,
          p_status: status,
          p_otp_input: otpInput ?? null,
          p_notes: notes ?? null,
        });
        if (error) throw error;
        await refreshProductionData();
        notify('success', `Delivery status updated to ${status.replace('_', ' ')}.`);
        return;
      }
      setDemoState((prev) =>
        demoUpdateDeliveryStatus(prev, deliveryId, status, currentUser?.fullName ?? 'Rider', otpInput, notes)
      );
      notify('success', `Delivery status updated to ${status.replace('_', ' ')}.`);
    },
    [currentUser, envMode, notify, refreshProductionData, requireOnlineGuard, requireProdClient]
  );

  const openCashShift = useCallback(
    async (drawerId: string, openingCash: number, blindCount: boolean) => {
      requireOnlineGuard();
      if (envMode === 'production') {
        const sb = requireProdClient();
        const branchId = currentUser?.branchId ?? prodState.branch.id;
        if (!branchId || !currentUser) throw new Error('Authenticated staff & branch required.');
        const { error } = await sb.from('cash_drawer_shifts').insert({
          env_mode: 'production',
          branch_id: branchId,
          drawer_id: drawerId,
          cashier_id: currentUser.id,
          cashier_name: currentUser.fullName,
          status: 'open',
          opening_cash: round2(openingCash),
          expected_cash: round2(openingCash),
          blind_count: blindCount,
        });
        if (error) throw error;
        await refreshProductionData();
        notify('success', 'Cash drawer shift opened.');
        return;
      }
      commitDemo((prev) => {
        const next: DemoState = structuredClone(prev);
        const shift: CashDrawerShift = {
          id: `shf_${Date.now()}`,
          envMode: 'demo',
          branchId: next.branch.id,
          drawerId,
          cashierId: currentUser?.id ?? 'usr_cashier',
          cashierName: currentUser?.fullName ?? 'Cashier',
          status: 'open',
          openingCash: round2(openingCash),
          cashSalesExpected: 0,
          cashInTotal: 0,
          cashOutTotal: 0,
          expectedCash: round2(openingCash),
          blindCount,
          openedAt: new Date().toISOString(),
          movements: [],
        };
        next.shifts.unshift(shift);
        return next;
      });
      notify('success', 'Cash drawer shift opened.');
    },
    [commitDemo, currentUser, envMode, notify, prodState.branch.id, refreshProductionData, requireOnlineGuard, requireProdClient]
  );

  const addCashMovement = useCallback(
    async (shiftId: string, type: 'cash_in' | 'cash_out', amount: number, reason: string) => {
      requireOnlineGuard();
      if (envMode === 'production') {
        const sb = requireProdClient();
        const { error } = await sb.rpc('add_cash_movement_transactional', {
          p_shift_id: shiftId,
          p_type: type,
          p_amount: amount,
          p_reason: reason,
        });
        if (error) throw error;
        await refreshProductionData();
        notify('success', 'Cash drawer movement recorded.');
        return;
      }
      commitDemo((prev) => {
        const next: DemoState = structuredClone(prev);
        const shift = next.shifts.find((s) => s.id === shiftId);
        if (!shift || shift.status !== 'open') return prev;
        shift.movements.unshift({
          id: `cmv_${Date.now()}`,
          shiftId,
          type,
          amount: round2(amount),
          reason,
          createdBy: currentUser?.fullName ?? 'Cashier',
          createdAt: new Date().toISOString(),
        });
        if (type === 'cash_in') shift.cashInTotal = round2(shift.cashInTotal + amount);
        else shift.cashOutTotal = round2(shift.cashOutTotal + amount);
        shift.expectedCash = round2(
          shift.openingCash + shift.cashSalesExpected + shift.cashInTotal - shift.cashOutTotal
        );
        return next;
      });
      notify('success', 'Cash drawer movement recorded.');
    },
    [commitDemo, currentUser, envMode, notify, refreshProductionData, requireOnlineGuard, requireProdClient]
  );

  const closeCashShift = useCallback(
    async (shiftId: string, denominations: Record<string, number>, notes?: string) => {
      requireOnlineGuard();
      if (envMode === 'production') {
        const sb = requireProdClient();
        const { error } = await sb.rpc('close_cash_shift_transactional', {
          p_shift_id: shiftId,
          p_denominations: denominations,
          p_notes: notes ?? null,
        });
        if (error) throw error;
        await refreshProductionData();
        notify('info', 'Shift count submitted for reconciliation.');
        return;
      }
      setDemoState((prev) =>
        demoCloseShift(prev, shiftId, denominations, currentUser?.fullName ?? 'Cashier', notes)
      );
      notify('info', 'Shift count submitted for reconciliation.');
    },
    [currentUser, envMode, notify, refreshProductionData, requireOnlineGuard, requireProdClient]
  );

  const approveCashShift = useCallback(
    async (shiftId: string) => {
      requireOnlineGuard();
      if (!can('cash_drawer', 'approve')) throw new Error('Manager approval permission required.');
      if (envMode === 'production') {
        const sb = requireProdClient();
        const { error } = await sb.rpc('approve_cash_shift_transactional', { p_shift_id: shiftId });
        if (error) throw error;
        await refreshProductionData();
        notify('success', 'Cash shift reconciliation approved and locked.');
        return;
      }
      commitDemo((prev) => {
        const next: DemoState = structuredClone(prev);
        const shift = next.shifts.find((s) => s.id === shiftId);
        if (shift) {
          shift.status = 'closed';
          shift.approvedByName = currentUser?.fullName ?? 'Manager';
        }
        return next;
      });
      notify('success', 'Cash shift reconciliation approved and locked.');
    },
    [can, commitDemo, currentUser, envMode, notify, refreshProductionData, requireOnlineGuard, requireProdClient]
  );

  const updateBusinessSettings = useCallback(
    async (patch: Partial<BusinessSettings>) => {
      if (envMode === 'production') {
        const sb = requireProdClient();
        const { error } = await sb
          .from('business_settings')
          .update({
            business_name: patch.businessName,
            address: patch.address,
            phone: patch.phone,
            email: patch.email,
            tin: patch.tin,
            receipt_footer: patch.receiptFooter,
            is_setup_completed: patch.isSetupCompleted,
            setup_step: patch.setupStep,
            updated_at: new Date().toISOString(),
          })
          .eq('env_mode', 'production');
        if (error) throw error;
        await refreshProductionData();
        notify('success', 'Business configuration saved.');
        return;
      }
      commitDemo((prev) => {
        const next: DemoState = structuredClone(prev);
        next.business = { ...next.business, ...patch };
        return next;
      });
      notify('success', 'Business configuration saved.');
    },
    [commitDemo, envMode, notify, refreshProductionData, requireProdClient]
  );

  const updateTaxProfile = useCallback(
    async (profile: TaxProfile) => {
      if (envMode === 'production') {
        const sb = requireProdClient();
        const branchId = currentUser?.branchId ?? prodState.branch.id;
        if (!branchId) throw new Error('Active branch context required.');
        if (profile.isDefault) {
          await sb.from('tax_profiles').update({ is_default: false }).eq('branch_id', branchId).eq('env_mode', 'production');
        }
        const exists = prodState.taxProfiles.some((t) => t.id === profile.id && profile.id !== 'default-pending');
        if (exists) {
          const { error } = await sb
            .from('tax_profiles')
            .update({
              name: profile.name,
              tax_type: profile.taxType,
              pricing_mode: profile.pricingMode,
              rate_percent: profile.ratePercent,
              is_exempt: profile.isExempt,
              is_default: profile.isDefault,
            })
            .eq('id', profile.id);
          if (error) throw error;
        } else {
          const { error } = await sb.from('tax_profiles').insert({
            env_mode: 'production',
            branch_id: branchId,
            name: profile.name,
            tax_type: profile.taxType,
            pricing_mode: profile.pricingMode,
            rate_percent: profile.ratePercent,
            is_exempt: profile.isExempt,
            is_default: profile.isDefault,
          });
          if (error) throw error;
        }
        await refreshProductionData();
        notify('success', 'Tax profile updated.');
        return;
      }
      commitDemo((prev) => {
        const next: DemoState = structuredClone(prev);
        if (profile.isDefault) {
          next.taxProfiles.forEach((t) => (t.isDefault = false));
        }
        const idx = next.taxProfiles.findIndex((t) => t.id === profile.id);
        if (idx >= 0) next.taxProfiles[idx] = profile;
        else next.taxProfiles.push(profile);
        return next;
      });
      notify('success', 'Tax profile updated.');
    },
    [commitDemo, currentUser?.branchId, envMode, notify, prodState.branch.id, prodState.taxProfiles, refreshProductionData, requireProdClient]
  );

  const updateChannelPolicy = useCallback(
    async (policy: ChannelPolicy) => {
      if (envMode === 'production') {
        const sb = requireProdClient();
        const { error } = await sb
          .from('channel_policies')
          .update({
            approval_policy: policy.approvalPolicy,
            require_payment_before_confirm: policy.requirePaymentBeforeConfirm,
          })
          .eq('id', policy.id);
        if (error) throw error;
        await refreshProductionData();
        notify('success', `${policy.channel.toUpperCase()} approval policy updated.`);
        return;
      }
      commitDemo((prev) => {
        const next: DemoState = structuredClone(prev);
        const idx = next.channelPolicies.findIndex((c) => c.channel === policy.channel);
        if (idx >= 0) next.channelPolicies[idx] = policy;
        else next.channelPolicies.push(policy);
        return next;
      });
      notify('success', `${policy.channel.toUpperCase()} approval policy updated.`);
    },
    [commitDemo, envMode, notify, refreshProductionData, requireProdClient]
  );

  const inviteStaffMember = useCallback(
    async (fullName: string, email: string, roleKey: Exclude<StaffRoleKey, 'super_admin'>) => {
      requireOnlineGuard();
      if (!can('staff', 'create')) throw new Error('Permission denied: staff.create required.');
      if (envMode === 'production') {
        const sb = requireProdClient();
        const { data, error } = await sb.functions.invoke('invite-staff', {
          body: { fullName, email, roleKey, branchId: currentUser?.branchId },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        await refreshProductionData();
        notify('success', `Invitation sent to ${email}.`);
        return;
      }

      commitDemo((prev) => {
        const next: DemoState = structuredClone(prev);
        const inviteCode = Math.random().toString(36).slice(2, 8).toUpperCase();
        next.invitations.unshift({
          id: `inv_${Date.now()}`,
          envMode: 'demo',
          branchId: next.branch.id,
          email,
          fullName,
          roleKey,
          inviteCode,
          expiresAt: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
        });
        next.users.push({
          id: `usr_${Date.now()}`,
          envMode: 'demo',
          branchId: next.branch.id,
          fullName,
          email,
          roleKey,
          isActive: true,
          sessionTimeoutMinutes: 240,
        });
        return next;
      });
      notify('success', `Staff account invitation issued for ${fullName}.`);
    },
    [can, commitDemo, currentUser, envMode, notify, refreshProductionData, requireOnlineGuard, requireProdClient]
  );

  const togglePermissionOverride = useCallback(
    async (userId: string, module: AppModule, action: PermissionAction, value: boolean) => {
      if (!can('staff', 'edit')) throw new Error('Only Super Admin / authorized managers can edit permissions.');
      if (envMode === 'production') {
        const sb = requireProdClient();
        const target = prodState.users.find((u) => u.id === userId);
        const existingMod = target?.customPermissions?.[module];
        const row = {
          user_id: userId,
          module,
          can_view: action === 'view' ? value : existingMod?.view ?? null,
          can_create: action === 'create' ? value : existingMod?.create ?? null,
          can_edit: action === 'edit' ? value : existingMod?.edit ?? null,
          can_delete: action === 'delete' ? value : existingMod?.delete ?? null,
          can_approve: action === 'approve' ? value : existingMod?.approve ?? null,
          can_export: action === 'export' ? value : existingMod?.export ?? null,
        };
        const { error } = await sb.from('user_permission_overrides').upsert(row, { onConflict: 'user_id,module' });
        if (error) throw error;
        await refreshProductionData();
        return;
      }
      commitDemo((prev) => {
        const next: DemoState = structuredClone(prev);
        const usr = next.users.find((u) => u.id === userId);
        if (!usr) return prev;
        usr.customPermissions = usr.customPermissions ?? {};
        usr.customPermissions[module] = {
          ...(usr.customPermissions[module] ?? {
            view: false,
            create: false,
            edit: false,
            delete: false,
            approve: false,
            export: false,
          }),
          [action]: value,
        };
        return next;
      });
    },
    [can, commitDemo, envMode, prodState.users, refreshProductionData, requireProdClient]
  );

  const markNotificationRead = useCallback(
    (notifId: string) => {
      if (envMode === 'production') {
        const sb = getSupabaseClient();
        if (sb) {
          sb.from('in_app_notifications')
            .update({ is_read: true })
            .eq('id', notifId)
            .then(() => void refreshProductionData());
        }
        return;
      }
      commitDemo((prev) => {
        const next: DemoState = structuredClone(prev);
        const n = next.notifications.find((item) => item.id === notifId);
        if (n) n.isRead = true;
        return next;
      });
    },
    [commitDemo, envMode, refreshProductionData]
  );

  const value: AppContextValue = {
    envMode,
    setEnvMode,
    isOnline,
    supabaseReady: isSupabaseConfigured,
    isLoadingData,
    dataError,
    currentUser,
    cafeState,
    toasts,
    dismissToast,
    notify,
    can,
    switchDemoRole,
    resetDemo,
    refreshProductionData,
    signInProduction,
    setupInitialOwnerProduction,
    signOut,
    placeOrder,
    confirmPendingOrder,
    completeOrder,
    cancelOrder,
    advanceKdsItem,
    recordPayment,
    verifyPayment,
    refundPayment,
    stockAdjustIngredient,
    overrideProductAvailability,
    createProduct,
    createIngredient,
    saveRecipeForProduct,
    moveTableOnFloor,
    updateTableStatus,
    transferTableOrder,
    addToTableCart,
    clearTableCart,
    sendTableServiceRequest,
    resolveServiceRequest,
    assignDeliveryRider,
    updateDeliveryStatus,
    openCashShift,
    addCashMovement,
    closeCashShift,
    approveCashShift,
    updateBusinessSettings,
    updateTaxProfile,
    updateChannelPolicy,
    inviteStaffMember,
    togglePermissionOverride,
    markNotificationRead,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
