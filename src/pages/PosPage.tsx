import React, { useMemo, useState } from 'react';
import { Barcode, Minus, Plus, Printer, Search, ShoppingBag, Trash2, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Order, OrderType, PaymentMethod, Product, SelectedModifier } from '../types/cafe';
import { calculateOrderTotals, formatPHP } from '../lib/businessLogic';
import { paymentSubmissionSchema } from '../lib/validation';
import { ReceiptPrinterModal } from '../components/ReceiptPrinterModal';

interface CartLine {
  key: string;
  productId: string;
  productName: string;
  variantId?: string;
  variantName?: string;
  unitPrice: number;
  quantity: number;
  modifiers: SelectedModifier[];
  notes?: string;
}

export const PosPage: React.FC = () => {
  const { cafeState, isOnline, placeOrder, recordPayment, notify } = useApp();

  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [orderType, setOrderType] = useState<OrderType>('dine_in');
  const [tableId, setTableId] = useState<string>(cafeState.tables[0]?.id ?? '');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryFee, setDeliveryFee] = useState<number>(65);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [discountReason, setDiscountReason] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [isPriority, setIsPriority] = useState(false);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [customizingProduct, setCustomizingProduct] = useState<Product | null>(null);
  const [chosenVariantId, setChosenVariantId] = useState<string>('');
  const [chosenModifiers, setChosenModifiers] = useState<Record<string, SelectedModifier[]>>({});
  const [itemNotes, setItemNotes] = useState('');

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [paymentRef, setPaymentRef] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);

  const defaultTax = cafeState.taxProfiles.find((t) => t.isDefault) ?? cafeState.taxProfiles[0];

  const filteredProducts = useMemo(() => {
    return cafeState.products.filter((p) => {
      if (selectedCategoryId !== 'all' && p.categoryId !== selectedCategoryId) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.barcode && p.barcode.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [cafeState.products, selectedCategoryId, searchQuery]);

  const itemsSubtotal = useMemo(
    () => cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0),
    [cart]
  );

  const pricing = useMemo(
    () =>
      calculateOrderTotals({
        itemsSubtotal,
        discountAmount,
        deliveryFee: orderType === 'delivery' ? deliveryFee : 0,
        taxProfile: defaultTax,
      }),
    [itemsSubtotal, discountAmount, orderType, deliveryFee, defaultTax]
  );

  const openCustomizer = (product: Product) => {
    if (!product.isAvailable) {
      notify('error', `${product.name} is currently unavailable.`);
      return;
    }
    const defVar = product.variants.find((v) => v.isDefault) ?? product.variants[0];
    setChosenVariantId(defVar?.id ?? '');
    const initialMods: Record<string, SelectedModifier[]> = {};
    for (const gid of product.modifierGroupIds) {
      const grp = cafeState.modifierGroups.find((g) => g.id === gid);
      if (grp && grp.isRequired && grp.options.length > 0) {
        const opt = grp.options[0];
        initialMods[gid] = [
          {
            groupId: grp.id,
            groupName: grp.name,
            optionId: opt.id,
            optionName: opt.name,
            priceDelta: opt.priceDelta,
            ingredientId: opt.ingredientId,
            ingredientQtyDelta: opt.ingredientQtyDelta,
          },
        ];
      }
    }
    setChosenModifiers(initialMods);
    setItemNotes('');
    setCustomizingProduct(product);
  };

  const addCustomizedToCart = () => {
    if (!customizingProduct) return;
    const variant = customizingProduct.variants.find((v) => v.id === chosenVariantId);
    const flatMods = Object.values(chosenModifiers).flat();
    const modDelta = flatMods.reduce((s, m) => s + m.priceDelta, 0);
    const unitPrice = customizingProduct.basePrice + (variant?.priceDelta ?? 0) + modDelta;
    const key = `${customizingProduct.id}_${variant?.id ?? 'std'}_${flatMods.map((m) => m.optionId).sort().join(',')}_${itemNotes}`;

    setCart((prev) => {
      const idx = prev.findIndex((c) => c.key === key);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [
        ...prev,
        {
          key,
          productId: customizingProduct.id,
          productName: customizingProduct.name,
          variantId: variant?.id,
          variantName: variant?.name,
          unitPrice,
          quantity: 1,
          modifiers: flatMods,
          notes: itemNotes.trim() || undefined,
        },
      ];
    });
    setCustomizingProduct(null);
  };

  const handleBarcodeScan = (e: React.FormEvent) => {
    e.preventDefault();
    const code = barcodeInput.trim();
    if (!code) return;
    const matched = cafeState.products.find((p) => p.barcode === code || p.sku.toLowerCase() === code.toLowerCase());
    if (!matched) {
      notify('error', `No product found matching barcode/SKU "${code}".`);
      return;
    }
    if (!matched.isAvailable) {
      notify('error', `${matched.name} cannot be added (unavailable).`);
      return;
    }
    const defVar = matched.variants.find((v) => v.isDefault) ?? matched.variants[0];
    setCart((prev) => [
      ...prev,
      {
        key: `${matched.id}_${defVar?.id ?? 'std'}_scan_${Date.now()}`,
        productId: matched.id,
        productName: matched.name,
        variantId: defVar?.id,
        variantName: defVar?.name,
        unitPrice: matched.basePrice + (defVar?.priceDelta ?? 0),
        quantity: 1,
        modifiers: [],
      },
    ]);
    setBarcodeInput('');
    notify('success', `Scanned ${matched.name}`);
  };

  const handleCheckout = async (payNow: boolean) => {
    if (cart.length === 0) {
      notify('error', 'Add at least one item to the order.');
      return;
    }
    if (!isOnline) {
      notify('error', 'Offline: cannot process orders while disconnected.');
      return;
    }
    if (orderType === 'delivery' && (!customerName.trim() || !deliveryAddress.trim())) {
      notify('error', 'Delivery orders require customer name and address.');
      return;
    }

    if (payNow) {
      const check = paymentSubmissionSchema.safeParse({
        method: paymentMethod,
        amount: pricing.totalAmount,
        referenceNumber: paymentRef,
      });
      if (!check.success) {
        notify('error', check.error.issues[0].message);
        return;
      }
    }

    setSubmitting(true);
    try {
      const created = await placeOrder({
        channel: 'pos',
        orderType,
        tableId: orderType === 'dine_in' ? tableId : undefined,
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        deliveryAddress: orderType === 'delivery' ? deliveryAddress.trim() : undefined,
        deliveryFee: orderType === 'delivery' ? deliveryFee : 0,
        discountTotal: discountAmount,
        discountReason: discountReason.trim() || undefined,
        orderNotes: orderNotes.trim() || undefined,
        isPriority,
        items: cart.map((c) => ({
          productId: c.productId,
          variantId: c.variantId,
          variantName: c.variantName,
          quantity: c.quantity,
          unitPrice: c.unitPrice,
          modifiers: c.modifiers,
          notes: c.notes,
        })),
      });

      if (payNow) {
        await recordPayment({
          orderId: created.id,
          method: paymentMethod,
          amount: pricing.totalAmount,
          referenceNumber: paymentRef.trim() || undefined,
        });
      }

      setCart([]);
      setDiscountAmount(0);
      setDiscountReason('');
      setOrderNotes('');
      setPaymentRef('');
      setIsPriority(false);
      setReceiptOrder(created);
    } catch (err) {
      notify('error', (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6 items-start">
      {/* Left: Catalog */}
      <div className="space-y-4">
        <div className="bg-white border border-[#E8DFD3] rounded-xl p-4 flex flex-wrap gap-3 items-center justify-between">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-[#8B6956] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search coffee, pastry, SKU..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-[#D7C8B6] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3A2920]"
            />
          </div>
          <form onSubmit={handleBarcodeScan} className="flex items-center gap-2">
            <div className="relative">
              <Barcode className="w-4 h-4 text-[#8B6956] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                placeholder="Scan barcode / SKU"
                className="pl-9 pr-3 py-2 text-sm border border-[#D7C8B6] rounded-lg font-mono w-48"
              />
            </div>
            <button
              type="submit"
              className="px-3 py-2 text-xs font-medium bg-[#F4EFE8] border border-[#D7C8B6] rounded-lg hover:bg-[#E8DFD3]"
            >
              Scan
            </button>
          </form>
        </div>

        {/* Category Filter */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            onClick={() => setSelectedCategoryId('all')}
            className={`px-3.5 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
              selectedCategoryId === 'all'
                ? 'bg-[#231914] text-white'
                : 'bg-white border border-[#E8DFD3] text-[#523B2F] hover:bg-[#F4EFE8]'
            }`}
          >
            All Menu
          </button>
          {cafeState.categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategoryId(cat.id)}
              className={`px-3.5 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                selectedCategoryId === cat.id
                  ? 'bg-[#231914] text-white'
                  : 'bg-white border border-[#E8DFD3] text-[#523B2F] hover:bg-[#F4EFE8]'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Product Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredProducts.map((product) => (
            <button
              key={product.id}
              onClick={() => openCustomizer(product)}
              disabled={!product.isAvailable}
              className={`text-left bg-white border border-[#E8DFD3] rounded-xl overflow-hidden transition-transform hover:-translate-y-0.5 flex flex-col ${
                !product.isAvailable ? 'opacity-55 cursor-not-allowed' : ''
              }`}
            >
              <div className="aspect-[4/3] w-full bg-[#F4EFE8] overflow-hidden">
                {product.imageUrl ? (
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-[#6E5040]">
                    {product.sku}
                  </div>
                )}
              </div>
              <div className="p-4 flex-1 flex flex-col justify-between">
                <div>
                  <div className="text-[11px] font-mono text-[#8B6956]">
                    {product.sku} · {product.isAvailable ? 'In Stock' : product.unavailableReason || 'Out of Stock'}
                  </div>
                  <h3 className="font-semibold text-sm text-[#231914] mt-1">{product.name}</h3>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="font-mono tabular-nums font-semibold text-sm text-[#231914]">
                    {formatPHP(product.basePrice)}
                  </span>
                  <span className="text-xs font-medium text-[#523B2F]">Select</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right: Ticket & Checkout */}
      <div className="bg-white border border-[#E8DFD3] rounded-xl p-5 space-y-4 sticky top-20">
        <div className="flex items-center justify-between border-b border-[#E8DFD3] pb-3">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-[#231914]" />
            <h2 className="font-semibold text-sm text-[#231914]">Current Order</h2>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-[#523B2F] cursor-pointer">
            <input
              type="checkbox"
              checked={isPriority}
              onChange={(e) => setIsPriority(e.target.checked)}
            />
            Priority Ticket
          </label>
        </div>

        {/* Order Type */}
        <div className="grid grid-cols-3 gap-1 p-1 bg-[#F4EFE8] rounded-lg">
          {(['dine_in', 'takeout', 'delivery'] as OrderType[]).map((t) => (
            <button
              key={t}
              onClick={() => setOrderType(t)}
              className={`py-1.5 text-xs font-medium rounded-md capitalize ${
                orderType === t ? 'bg-white text-[#231914] shadow-sm' : 'text-[#6E5040]'
              }`}
            >
              {t.replace('_', ' ')}
            </button>
          ))}
        </div>

        {orderType === 'dine_in' && (
          <div>
            <label className="block text-xs font-medium text-[#523B2F] mb-1">Table Assignment</label>
            <select
              value={tableId}
              onChange={(e) => setTableId(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-[#D7C8B6] rounded-lg bg-white"
            >
              {cafeState.tables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.tableNumber} ({t.seats} seats · {t.status})
                </option>
              ))}
            </select>
          </div>
        )}

        {orderType === 'delivery' && (
          <div className="space-y-2 p-3 bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg">
            <input
              placeholder="Customer Name *"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-[#D7C8B6] rounded bg-white"
            />
            <input
              placeholder="Phone Number *"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-[#D7C8B6] rounded bg-white"
            />
            <input
              placeholder="Delivery Address *"
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-[#D7C8B6] rounded bg-white"
            />
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#523B2F]">Delivery Fee (₱)</span>
              <input
                type="number"
                value={deliveryFee}
                onChange={(e) => setDeliveryFee(Number(e.target.value))}
                className="w-24 px-2 py-1 text-right font-mono border border-[#D7C8B6] rounded bg-white"
              />
            </div>
          </div>
        )}

        {/* Cart items */}
        <div className="max-h-60 overflow-y-auto divide-y divide-[#F4EFE8]">
          {cart.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#6E5040]">
              Tap menu items or scan a barcode to start an order.
            </div>
          ) : (
            cart.map((line) => (
              <div key={line.key} className="py-2.5 flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-[#231914] truncate">
                    {line.productName} {line.variantName ? `· ${line.variantName}` : ''}
                  </div>
                  {line.modifiers.length > 0 && (
                    <div className="text-[11px] text-[#6E5040] truncate">
                      {line.modifiers.map((m) => m.optionName).join(' · ')}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-1.5">
                    <button
                      onClick={() =>
                        setCart((prev) =>
                          prev
                            .map((c) => (c.key === line.key ? { ...c, quantity: c.quantity - 1 } : c))
                            .filter((c) => c.quantity > 0)
                        )
                      }
                      className="p-1 border border-[#D7C8B6] rounded hover:bg-[#F4EFE8]"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-xs font-mono tabular-nums w-5 text-center">{line.quantity}</span>
                    <button
                      onClick={() =>
                        setCart((prev) =>
                          prev.map((c) => (c.key === line.key ? { ...c, quantity: c.quantity + 1 } : c))
                        )
                      }
                      className="p-1 border border-[#D7C8B6] rounded hover:bg-[#F4EFE8]"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-mono tabular-nums font-semibold">
                    {formatPHP(line.unitPrice * line.quantity)}
                  </div>
                  <button
                    onClick={() => setCart((prev) => prev.filter((c) => c.key !== line.key))}
                    className="text-[#991B1B] mt-1 p-1"
                    title="Remove item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Discount & Notes */}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#E8DFD3]">
          <input
            type="number"
            min={0}
            placeholder="Discount ₱"
            value={discountAmount || ''}
            onChange={(e) => setDiscountAmount(Number(e.target.value))}
            className="px-2.5 py-1.5 text-xs font-mono border border-[#D7C8B6] rounded-lg"
          />
          <input
            placeholder="Discount / Order note"
            value={discountReason || orderNotes}
            onChange={(e) => {
              setDiscountReason(e.target.value);
              setOrderNotes(e.target.value);
            }}
            className="px-2.5 py-1.5 text-xs border border-[#D7C8B6] rounded-lg"
          />
        </div>

        {/* Totals */}
        <div className="space-y-1 text-xs border-t border-[#E8DFD3] pt-3">
          <div className="flex justify-between text-[#523B2F]">
            <span>Subtotal</span>
            <span className="font-mono tabular-nums">{formatPHP(pricing.subtotal)}</span>
          </div>
          {pricing.discountTotal > 0 && (
            <div className="flex justify-between text-[#991B1B]">
              <span>Discount</span>
              <span className="font-mono tabular-nums">-{formatPHP(pricing.discountTotal)}</span>
            </div>
          )}
          <div className="flex justify-between text-[#523B2F]">
            <span>{defaultTax.name}</span>
            <span className="font-mono tabular-nums">{formatPHP(pricing.taxTotal)}</span>
          </div>
          {pricing.deliveryFee > 0 && (
            <div className="flex justify-between text-[#523B2F]">
              <span>Delivery Fee</span>
              <span className="font-mono tabular-nums">{formatPHP(pricing.deliveryFee)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold text-[#231914] pt-1.5 border-t border-[#F4EFE8]">
            <span>Total</span>
            <span className="font-mono tabular-nums">{formatPHP(pricing.totalAmount)}</span>
          </div>
        </div>

        {/* Payment Capture */}
        <div className="space-y-2 pt-2 border-t border-[#E8DFD3]">
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
            className="w-full px-3 py-2 text-xs border border-[#D7C8B6] rounded-lg bg-white"
          >
            <option value="cash">Cash</option>
            <option value="gcash">GCash (Manual Reference Verification)</option>
            <option value="maya">Maya (Manual Reference Verification)</option>
            <option value="card">Card Terminal</option>
            <option value="bank_transfer">Bank Transfer</option>
          </select>
          {paymentMethod !== 'cash' && (
            <input
              placeholder="Reference / Approval Code *"
              value={paymentRef}
              onChange={(e) => setPaymentRef(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono border border-[#D7C8B6] rounded-lg"
            />
          )}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              disabled={submitting || !isOnline || cart.length === 0}
              onClick={() => handleCheckout(false)}
              className="py-2.5 text-xs font-medium border border-[#231914] text-[#231914] rounded-lg hover:bg-[#F4EFE8] disabled:opacity-40"
            >
              Pay Later (Open Tab)
            </button>
            <button
              disabled={submitting || !isOnline || cart.length === 0}
              onClick={() => handleCheckout(true)}
              className="py-2.5 text-xs font-medium bg-[#231914] text-white rounded-lg hover:bg-[#3A2920] disabled:opacity-40"
            >
              {paymentMethod === 'cash' ? 'Pay & Confirm' : 'Submit & Confirm'}
            </button>
          </div>
        </div>
      </div>

      {/* Product Customizer Modal */}
      {customizingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white border border-[#E8DFD3] rounded-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-base text-[#231914]">{customizingProduct.name}</h3>
                <p className="text-xs text-[#6E5040] mt-0.5">{customizingProduct.description}</p>
              </div>
              <button onClick={() => setCustomizingProduct(null)} className="p-1 text-[#6E5040]">
                <X className="w-4 h-4" />
              </button>
            </div>

            {customizingProduct.variants.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-[#523B2F]">Size / Variant</div>
                <div className="grid grid-cols-2 gap-2">
                  {customizingProduct.variants.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setChosenVariantId(v.id)}
                      className={`px-3 py-2 text-xs rounded-lg border text-left flex justify-between ${
                        chosenVariantId === v.id
                          ? 'bg-[#231914] text-white border-[#231914]'
                          : 'bg-white border-[#D7C8B6]'
                      }`}
                    >
                      <span>{v.name}</span>
                      <span className="font-mono">+{formatPHP(v.priceDelta)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {customizingProduct.modifierGroupIds.map((gid) => {
              const grp = cafeState.modifierGroups.find((g) => g.id === gid);
              if (!grp) return null;
              const selected = chosenModifiers[gid] ?? [];
              return (
                <div key={gid} className="space-y-1.5">
                  <div className="text-xs font-medium text-[#523B2F]">
                    {grp.name} {grp.isRequired ? '(Required)' : ''}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {grp.options.map((opt) => {
                      const active = selected.some((s) => s.optionId === opt.id);
                      return (
                        <button
                          key={opt.id}
                          onClick={() => {
                            const modObj: SelectedModifier = {
                              groupId: grp.id,
                              groupName: grp.name,
                              optionId: opt.id,
                              optionName: opt.name,
                              priceDelta: opt.priceDelta,
                              ingredientId: opt.ingredientId,
                              ingredientQtyDelta: opt.ingredientQtyDelta,
                            };
                            setChosenModifiers((prev) => {
                              if (grp.selectionType === 'single') return { ...prev, [gid]: [modObj] };
                              const curr = prev[gid] ?? [];
                              return {
                                ...prev,
                                [gid]: active
                                  ? curr.filter((x) => x.optionId !== opt.id)
                                  : [...curr, modObj],
                              };
                            });
                          }}
                          className={`px-3 py-1.5 text-xs rounded-lg border ${
                            active
                              ? 'bg-[#231914] text-white border-[#231914]'
                              : 'bg-white border-[#D7C8B6] text-[#231914]'
                          }`}
                        >
                          {opt.name} {opt.priceDelta > 0 ? `(+${formatPHP(opt.priceDelta)})` : ''}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <input
              placeholder="Special preparation instructions..."
              value={itemNotes}
              onChange={(e) => setItemNotes(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-[#D7C8B6] rounded-lg"
            />

            <button
              onClick={addCustomizedToCart}
              className="w-full py-2.5 bg-[#231914] text-white text-sm font-medium rounded-lg hover:bg-[#3A2920]"
            >
              Add to Order
            </button>
          </div>
        </div>
      )}

      {receiptOrder && (
        <ReceiptPrinterModal
          order={receiptOrder}
          business={cafeState.business}
          branchName={cafeState.branch.name}
          branchAddress={cafeState.branch.address}
          branchPhone={cafeState.branch.phone}
          onClose={() => setReceiptOrder(null)}
        />
      )}
    </div>
  );
};
