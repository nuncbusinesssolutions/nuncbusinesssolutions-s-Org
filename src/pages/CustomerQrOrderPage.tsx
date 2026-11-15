import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Bell, Receipt, ShoppingBag, Users } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { OrderChannel, OrderType, PaymentMethod, Product, SelectedModifier, TableCartItem } from '../types/cafe';
import { formatPHP } from '../lib/businessLogic';
import { getSupabaseClient } from '../services/supabaseClient';

interface CustomerQrOrderPageProps {
  mode: 'qr_table' | 'kiosk' | 'online';
}

export const CustomerQrOrderPage: React.FC<CustomerQrOrderPageProps> = ({ mode }) => {
  const { tableToken } = useParams<{ tableToken: string }>();
  const navigate = useNavigate();
  const { envMode, cafeState, addToTableCart, clearTableCart, placeOrder, recordPayment, sendTableServiceRequest, notify } =
    useApp();

  const [prodTable, setProdTable] = useState<{ id: string; tableNumber: string; qrToken: string } | null>(null);
  const [prodQrLoading, setProdQrLoading] = useState(envMode === 'production' && mode === 'qr_table');
  const [prodQrInvalid, setProdQrInvalid] = useState(false);

  const demoTable = useMemo(
    () =>
      envMode === 'demo' && mode === 'qr_table' && tableToken
        ? cafeState.tables.find((t) => t.qrToken === tableToken)
        : undefined,
    [cafeState.tables, envMode, mode, tableToken]
  );

  const table = envMode === 'production' ? prodTable : demoTable;

  const [prodSharedItems, setProdSharedItems] = useState<TableCartItem[]>([]);
  const [guestLabel, setGuestLabel] = useState('Guest 1');
  const [orderType, setOrderType] = useState<OrderType>(mode === 'qr_table' ? 'dine_in' : 'takeout');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [paymentChoice, setPaymentChoice] = useState<'pay_counter' | 'gcash' | 'maya'>('pay_counter');
  const [paymentRef, setPaymentRef] = useState('');
  const [localCart, setLocalCart] = useState<
    Array<{ productId: string; variantId?: string; variantName?: string; unitPrice: number; quantity: number; modifiers: SelectedModifier[] }>
  >([]);

  const syncProdTableCart = useCallback(async () => {
    if (envMode !== 'production' || mode !== 'qr_table' || !tableToken) {
      setProdQrLoading(false);
      return;
    }
    const sb = getSupabaseClient();
    if (!sb) {
      setProdQrLoading(false);
      return;
    }
    const { data, error } = await sb.rpc('get_qr_table_context', { p_qr_token: tableToken });
    if (error || !data) {
      setProdTable(null);
      setProdQrInvalid(true);
      setProdQrLoading(false);
      return;
    }
    const tblData = (data as { table?: Record<string, unknown> }).table;
    if (!tblData?.id) {
      setProdTable(null);
      setProdQrInvalid(true);
      setProdQrLoading(false);
      return;
    }
    const resolvedTable = {
      id: String(tblData.id),
      tableNumber: String(tblData.table_number ?? 'Table'),
      qrToken: String(tblData.qr_token ?? tableToken),
    };
    setProdTable(resolvedTable);
    setProdQrInvalid(false);
    setProdQrLoading(false);

    const items = Array.isArray((data as { items?: unknown[] }).items)
      ? ((data as { items: Array<Record<string, unknown>> }).items).map((it) => ({
          id: String(it.id),
          tableId: resolvedTable.id,
          productId: String(it.product_id),
          variantId: it.variant_id ? String(it.variant_id) : undefined,
          guestLabel: String(it.guest_label ?? 'Guest'),
          quantity: Number(it.quantity ?? 1),
          selectedModifiers: Array.isArray(it.selected_modifiers) ? (it.selected_modifiers as SelectedModifier[]) : [],
          notes: it.notes ? String(it.notes) : undefined,
          unitPrice: Number(it.unit_price ?? 0),
        }))
      : [];
    setProdSharedItems(items);
  }, [envMode, mode, tableToken]);

  useEffect(() => {
    void syncProdTableCart();
  }, [syncProdTableCart]);

  if (mode === 'qr_table' && prodQrLoading) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center p-6">
        <div className="bg-white border border-[#E8DFD3] rounded-xl p-8 text-center text-xs text-[#6E5040]">
          Verifying table QR code...
        </div>
      </div>
    );
  }

  if (mode === 'qr_table' && tableToken && ((envMode === 'production' && prodQrInvalid) || (envMode === 'demo' && !demoTable && cafeState.tables.length > 0))) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center p-6">
        <div className="bg-white border border-[#E8DFD3] rounded-xl p-8 text-center space-y-2 max-w-sm">
          <h1 className="font-['Fraunces'] text-xl font-semibold text-[#231914]">Invalid Table QR Code</h1>
          <p className="text-xs text-[#6E5040]">Please scan the QR code displayed on your table or ask staff for assistance.</p>
        </div>
      </div>
    );
  }

  const sharedItems = envMode === 'production' ? prodSharedItems : table ? cafeState.tableCarts[table.id] ?? [] : [];
  const activeCart = mode === 'qr_table' && table ? sharedItems : localCart;

  const cartTotal = activeCart.reduce((s, item) => s + item.unitPrice * item.quantity, 0);

  const handleQuickAdd = async (prod: Product) => {
    if (!prod.isAvailable) return;
    const defVar = prod.variants.find((v) => v.isDefault) ?? prod.variants[0];
    const unitPrice = prod.basePrice + (defVar?.priceDelta ?? 0);

    try {
      if (mode === 'qr_table' && table) {
        await addToTableCart(
          table.id,
          {
            productId: prod.id,
            variantId: defVar?.id,
            guestLabel: guestLabel || 'Guest',
            quantity: 1,
            selectedModifiers: [],
            unitPrice,
          },
          table.qrToken
        );
        await syncProdTableCart();
        notify('success', `Added ${prod.name} to shared table cart.`);
      } else {
        setLocalCart((prev) => [
          ...prev,
          {
            productId: prod.id,
            variantId: defVar?.id,
            variantName: defVar?.name,
            unitPrice,
            quantity: 1,
            modifiers: [],
          },
        ]);
        notify('success', `Added ${prod.name}.`);
      }
    } catch (err) {
      notify('error', (err as Error).message);
    }
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (activeCart.length === 0) {
      notify('error', 'Your order cart is empty.');
      return;
    }
    if (paymentChoice !== 'pay_counter' && paymentRef.trim().length < 4) {
      notify('error', 'Enter your GCash/Maya reference number (min 4 characters).');
      return;
    }
    try {
      const channel: OrderChannel = mode;
      const itemsPayload = activeCart.map((c) => {
        const prod = cafeState.products.find((p) => p.id === c.productId)!;
        const variant = prod.variants.find((v) => v.id === c.variantId);
        return {
          productId: c.productId,
          variantId: c.variantId,
          variantName: variant?.name,
          quantity: c.quantity,
          unitPrice: c.unitPrice,
          modifiers: 'selectedModifiers' in c ? c.selectedModifiers : c.modifiers,
        };
      });

      const created = await placeOrder({
        channel,
        orderType: mode === 'qr_table' ? 'dine_in' : orderType,
        tableId: table?.id,
        customerName: customerName.trim() || guestLabel,
        customerPhone: customerPhone.trim() || undefined,
        deliveryAddress: orderType === 'delivery' ? deliveryAddress.trim() : undefined,
        deliveryFee: orderType === 'delivery' ? 65 : 0,
        items: itemsPayload,
      });

      if (paymentChoice !== 'pay_counter') {
        await recordPayment({
          orderId: created.id,
          method: paymentChoice as PaymentMethod,
          amount: created.totalAmount,
          referenceNumber: paymentRef.trim(),
        });
      }

      if (mode === 'qr_table' && table) {
        await clearTableCart(table.id);
        setProdSharedItems([]);
      } else {
        setLocalCart([]);
      }
      navigate(`/track/${created.trackingToken}`);
    } catch (err) {
      notify('error', (err as Error).message);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#231914] pb-16">
      <header className="bg-white border-b border-[#E8DFD3] px-4 sm:px-8 py-4 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-20">
        <div>
          <h1 className="font-['Fraunces'] text-xl font-semibold text-[#231914]">
            {cafeState.business.businessName}
          </h1>
          <p className="text-xs text-[#6E5040]">
            {mode === 'qr_table' && table
              ? `Table ${table.tableNumber} · Shared Table Ordering (No account required)`
              : mode === 'kiosk'
                ? 'Self-Ordering Kiosk'
                : 'Online Self-Ordering'}
          </p>
        </div>

        {mode === 'qr_table' && table && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void sendTableServiceRequest(table.id, 'call_waiter', undefined, table.qrToken)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-[#D7C8B6] bg-white rounded-lg hover:bg-[#F4EFE8]"
            >
              <Bell className="w-3.5 h-3.5" /> Call Waiter
            </button>
            <button
              type="button"
              onClick={() => void sendTableServiceRequest(table.id, 'request_bill', undefined, table.qrToken)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#231914] text-white rounded-lg"
            >
              <Receipt className="w-3.5 h-3.5" /> Request Bill
            </button>
          </div>
        )}
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 grid lg:grid-cols-[1fr_360px] gap-6 items-start">
        <div className="grid sm:grid-cols-2 gap-4">
          {cafeState.products.length === 0 ? (
            <div className="sm:col-span-2 bg-white border border-[#E8DFD3] rounded-xl p-10 text-center text-xs text-[#6E5040]">
              No active menu items are currently published for this branch.
            </div>
          ) : (
            cafeState.products.map((prod) => (
              <div key={prod.id} className="bg-white border border-[#E8DFD3] rounded-xl overflow-hidden flex flex-col">
                <div className="aspect-[4/3] bg-[#F4EFE8]">
                  {prod.imageUrl && (
                    <img
                      src={prod.imageUrl}
                      alt={prod.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <h2 className="font-semibold text-base text-[#231914]">{prod.name}</h2>
                    <p className="text-xs text-[#6E5040] mt-1">{prod.description}</p>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="font-mono tabular-nums font-semibold text-sm">{formatPHP(prod.basePrice)}</span>
                    <button
                      disabled={!prod.isAvailable}
                      onClick={() => handleQuickAdd(prod)}
                      className="px-4 py-2 text-xs font-medium bg-[#231914] text-white rounded-lg disabled:opacity-40"
                    >
                      {prod.isAvailable ? 'Add to Order' : 'Unavailable'}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <form onSubmit={handleSubmitOrder} className="bg-white border border-[#E8DFD3] rounded-xl p-5 space-y-4 sticky top-24">
          <div className="flex items-center justify-between border-b border-[#E8DFD3] pb-3">
            <h3 className="font-semibold text-sm text-[#231914] flex items-center gap-2">
              {mode === 'qr_table' ? <Users className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />}
              {mode === 'qr_table' ? 'Shared Table Cart' : 'Your Order'}
            </h3>
            <span className="font-mono text-xs text-[#6E5040]">{activeCart.length} item(s)</span>
          </div>

          {mode === 'qr_table' ? (
            <div>
              <label className="block text-[11px] font-medium text-[#523B2F] mb-1">Your Name / Seat Label</label>
              <input
                value={guestLabel}
                onChange={(e) => setGuestLabel(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-[#D7C8B6] rounded-lg"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-1 p-1 bg-[#F4EFE8] rounded-lg">
                {(['takeout', 'delivery'] as OrderType[]).map((t) => (
                  <button
                    type="button"
                    key={t}
                    onClick={() => setOrderType(t)}
                    className={`py-1.5 text-xs font-medium rounded capitalize ${
                      orderType === t ? 'bg-white text-[#231914] shadow-sm' : 'text-[#6E5040]'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <input
                required
                placeholder="Your Name *"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-[#D7C8B6] rounded-lg"
              />
              {orderType === 'delivery' && (
                <>
                  <input
                    required
                    placeholder="Mobile Number *"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border border-[#D7C8B6] rounded-lg"
                  />
                  <input
                    required
                    placeholder="Delivery Address *"
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border border-[#D7C8B6] rounded-lg"
                  />
                </>
              )}
            </div>
          )}

          <div className="divide-y divide-[#F4EFE8] max-h-52 overflow-y-auto text-xs">
            {activeCart.map((c, idx) => {
              const prod = cafeState.products.find((p) => p.id === c.productId);
              return (
                <div key={idx} className="py-2 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{c.quantity}x {prod?.name}</div>
                    {'guestLabel' in c && <div className="text-[11px] text-[#6E5040]">Added by {c.guestLabel}</div>}
                  </div>
                  <span className="font-mono tabular-nums">{formatPHP(c.unitPrice * c.quantity)}</span>
                </div>
              );
            })}
          </div>

          <div className="pt-2 border-t border-[#E8DFD3] space-y-2 text-xs">
            <div className="flex justify-between font-bold text-sm">
              <span>Estimated Total</span>
              <span className="font-mono tabular-nums">{formatPHP(cartTotal + (orderType === 'delivery' ? 65 : 0))}</span>
            </div>

            <select
              value={paymentChoice}
              onChange={(e) => setPaymentChoice(e.target.value as 'pay_counter' | 'gcash' | 'maya')}
              className="w-full px-3 py-2 border border-[#D7C8B6] rounded-lg bg-white"
            >
              <option value="pay_counter">Pay at Counter / Upon Delivery</option>
              <option value="gcash">GCash (Submit Reference for Verification)</option>
              <option value="maya">Maya (Submit Reference for Verification)</option>
            </select>

            {paymentChoice !== 'pay_counter' && (
              <input
                required
                placeholder="GCash / Maya Reference Number *"
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                className="w-full px-3 py-2 font-mono border border-[#D7C8B6] rounded-lg"
              />
            )}

            <button
              type="submit"
              disabled={activeCart.length === 0}
              className="w-full py-2.5 bg-[#231914] text-white font-medium rounded-lg hover:bg-[#3A2920] disabled:opacity-40"
            >
              Place Order
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
