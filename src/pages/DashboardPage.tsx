import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, Plus, SlidersHorizontal, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatPHP, round2 } from '../lib/businessLogic';

type WidgetId =
  | 'sales_overview'
  | 'order_types'
  | 'top_products'
  | 'low_stock'
  | 'gross_margin'
  | 'payments_cash'
  | 'kds_queue'
  | 'deliveries'
  | 'alerts';

const WIDGET_LABELS: Record<WidgetId, string> = {
  sales_overview: 'Sales & Order Volume',
  order_types: 'Sales by Order Type',
  top_products: 'Top-Selling Products',
  low_stock: 'Low-Stock & Inventory Value',
  gross_margin: 'Product Gross Margin',
  payments_cash: 'Payments & Cash Reconciliation',
  kds_queue: 'KDS Preparation Queue',
  deliveries: 'Delivery Operations',
  alerts: 'Operational Alerts',
};

const ROLE_DEFAULT_WIDGETS: Record<string, WidgetId[]> = {
  super_admin: ['sales_overview', 'order_types', 'top_products', 'low_stock', 'gross_margin', 'payments_cash', 'alerts'],
  manager: ['sales_overview', 'order_types', 'low_stock', 'payments_cash', 'kds_queue', 'alerts'],
  cashier: ['sales_overview', 'payments_cash', 'order_types', 'alerts'],
  barista: ['kds_queue', 'low_stock', 'alerts'],
  rider: ['deliveries', 'alerts'],
};

export const DashboardPage: React.FC = () => {
  const { currentUser, cafeState } = useApp();
  const roleKey = currentUser?.roleKey ?? 'super_admin';

  const [customizing, setCustomizing] = useState(false);
  const [widgetsByRole, setWidgetsByRole] = useState<Record<string, WidgetId[]>>(ROLE_DEFAULT_WIDGETS);

  const activeWidgets = widgetsByRole[roleKey] ?? ROLE_DEFAULT_WIDGETS.super_admin;

  const toggleWidget = (id: WidgetId) => {
    setWidgetsByRole((prev) => {
      const current = prev[roleKey] ?? ROLE_DEFAULT_WIDGETS[roleKey] ?? [];
      const exists = current.includes(id);
      return {
        ...prev,
        [roleKey]: exists ? current.filter((w) => w !== id) : [...current, id],
      };
    });
  };

  const moveWidget = (index: number, dir: -1 | 1) => {
    setWidgetsByRole((prev) => {
      const list = [...(prev[roleKey] ?? [])];
      const target = index + dir;
      if (target < 0 || target >= list.length) return prev;
      [list[index], list[target]] = [list[target], list[index]];
      return { ...prev, [roleKey]: list };
    });
  };

  const metrics = useMemo(() => {
    const validOrders = cafeState.orders.filter((o) => o.status !== 'cancelled');
    const totalSales = round2(validOrders.reduce((s, o) => s + o.totalAmount, 0));
    const totalIngredientCost = round2(
      validOrders.reduce(
        (s, o) => s + o.items.reduce((isum, i) => isum + i.unitCostSnapshot * i.quantity, 0),
        0
      )
    );
    const grossProfit = round2(totalSales - totalIngredientCost);
    const grossMarginPct = totalSales > 0 ? round2((grossProfit / totalSales) * 100) : 0;

    const byType = {
      dine_in: validOrders.filter((o) => o.orderType === 'dine_in'),
      takeout: validOrders.filter((o) => o.orderType === 'takeout'),
      delivery: validOrders.filter((o) => o.orderType === 'delivery'),
    };

    const productCounts: Record<string, { name: string; qty: number; revenue: number }> = {};
    for (const o of validOrders) {
      for (const item of o.items) {
        if (!productCounts[item.productId]) {
          productCounts[item.productId] = { name: item.productName, qty: 0, revenue: 0 };
        }
        productCounts[item.productId].qty += item.quantity;
        productCounts[item.productId].revenue += item.lineTotal;
      }
    }
    const topProducts = Object.values(productCounts).sort((a, b) => b.qty - a.qty).slice(0, 5);

    const lowStock = cafeState.ingredients.filter(
      (i) => i.currentStock - i.reservedStock <= i.reorderPoint
    );
    const inventoryValue = round2(
      cafeState.ingredients.reduce((s, i) => s + i.currentStock * i.unitCost, 0)
    );
    const openShift = cafeState.shifts.find((s) => s.status === 'open');
    const pendingPayments = cafeState.payments.filter((p) => p.status === 'pending_verification');
    const activeKdsItems = cafeState.orders
      .filter((o) => ['confirmed', 'preparing'].includes(o.status))
      .flatMap((o) => o.items.filter((i) => ['queued', 'preparing'].includes(i.kdsStatus)));

    return {
      totalSales,
      orderCount: validOrders.length,
      totalIngredientCost,
      grossProfit,
      grossMarginPct,
      byType,
      topProducts,
      lowStock,
      inventoryValue,
      openShift,
      pendingPayments,
      activeKdsItems,
    };
  }, [cafeState]);

  const availableToAdd = (Object.keys(WIDGET_LABELS) as WidgetId[]).filter(
    (w) => !activeWidgets.includes(w)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-['Fraunces'] text-2xl font-semibold text-[#231914]">
            {currentUser?.fullName} · Operations Overview
          </h2>
          <p className="text-xs text-[#6E5040] mt-0.5">
            {cafeState.branch.name} · Currency PHP (₱) · Asia/Manila
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCustomizing((c) => !c)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border border-[#D7C8B6] bg-white rounded-lg hover:bg-[#F4EFE8]"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            {customizing ? 'Done Customizing' : 'Customize Widgets'}
          </button>
          <Link
            to="/app/pos"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-[#231914] text-white rounded-lg hover:bg-[#3A2920]"
          >
            Open POS
          </Link>
        </div>
      </div>

      {customizing && availableToAdd.length > 0 && (
        <div className="bg-white border border-[#E8DFD3] rounded-xl p-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-[#523B2F] mr-2">Add widget:</span>
          {availableToAdd.map((w) => (
            <button
              key={w}
              onClick={() => toggleWidget(w)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-[#D7C8B6] rounded-lg hover:bg-[#FAF8F5]"
            >
              <Plus className="w-3 h-3" />
              {WIDGET_LABELS[w]}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {activeWidgets.map((widgetId, idx) => (
          <div
            key={widgetId}
            className="bg-white border border-[#E8DFD3] rounded-xl p-5 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-2 pb-3 mb-4 border-b border-[#F4EFE8]">
                <h3 className="text-sm font-semibold text-[#231914]">{WIDGET_LABELS[widgetId]}</h3>
                {customizing && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => moveWidget(idx, -1)}
                      disabled={idx === 0}
                      className="p-1 text-[#6E5040] hover:text-[#231914] disabled:opacity-30"
                      title="Move up"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => moveWidget(idx, 1)}
                      disabled={idx === activeWidgets.length - 1}
                      className="p-1 text-[#6E5040] hover:text-[#231914] disabled:opacity-30"
                      title="Move down"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => toggleWidget(widgetId)}
                      className="p-1 text-[#991B1B] hover:bg-[#FEF2F2] rounded"
                      title="Remove widget"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {widgetId === 'sales_overview' && (
                <div className="space-y-4">
                  <div>
                    <div className="text-xs text-[#6E5040]">Gross Sales Revenue</div>
                    <div className="text-3xl font-semibold font-mono tabular-nums text-[#231914] mt-1">
                      {formatPHP(metrics.totalSales)}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-3 border-t border-[#F4EFE8]">
                    <div>
                      <div className="text-xs text-[#6E5040]">Active & Completed Orders</div>
                      <div className="text-xl font-semibold font-mono tabular-nums mt-0.5">
                        {metrics.orderCount}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-[#6E5040]">Avg. Ticket</div>
                      <div className="text-xl font-semibold font-mono tabular-nums mt-0.5">
                        {formatPHP(metrics.orderCount > 0 ? metrics.totalSales / metrics.orderCount : 0)}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {widgetId === 'order_types' && (
                <div className="space-y-3 text-sm">
                  {(['dine_in', 'takeout', 'delivery'] as const).map((type) => {
                    const list = metrics.byType[type];
                    const sum = list.reduce((s, o) => s + o.totalAmount, 0);
                    return (
                      <div key={type} className="flex items-center justify-between py-1.5 border-b border-[#FAF8F5] last:border-0">
                        <span className="capitalize text-[#523B2F]">{type.replace('_', ' ')} ({list.length})</span>
                        <span className="font-mono tabular-nums font-semibold text-[#231914]">{formatPHP(sum)}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {widgetId === 'top_products' && (
                <div className="space-y-2.5 text-sm">
                  {metrics.topProducts.length === 0 ? (
                    <div className="text-xs text-[#6E5040]">No product sales recorded yet.</div>
                  ) : (
                    metrics.topProducts.map((p) => (
                      <div key={p.name} className="flex items-center justify-between text-xs">
                        <span className="text-[#231914] font-medium truncate pr-2">
                          {p.name} · <span className="text-[#6E5040] font-mono">{p.qty} sold</span>
                        </span>
                        <span className="font-mono tabular-nums font-semibold shrink-0">{formatPHP(p.revenue)}</span>
                      </div>
                    ))
                  )}
                </div>
              )}

              {widgetId === 'low_stock' && (
                <div className="space-y-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-[#6E5040]">Current Inventory Value</span>
                    <span className="text-lg font-mono tabular-nums font-semibold">{formatPHP(metrics.inventoryValue)}</span>
                  </div>
                  <div className="pt-2 border-t border-[#F4EFE8] space-y-2">
                    <div className="text-xs font-medium text-[#991B1B]">
                      Low-Stock Ingredients ({metrics.lowStock.length})
                    </div>
                    {metrics.lowStock.length === 0 ? (
                      <div className="text-xs text-[#6E5040]">All ingredients above reorder points.</div>
                    ) : (
                      metrics.lowStock.map((ing) => (
                        <div key={ing.id} className="flex items-center justify-between text-xs bg-[#FEF2F2] px-2.5 py-1.5 rounded">
                          <span className="font-medium text-[#991B1B]">{ing.name}</span>
                          <span className="font-mono tabular-nums text-[#991B1B]">
                            {round2(ing.currentStock - ing.reservedStock)} / {ing.reorderPoint} {ing.recipeUnit}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {widgetId === 'gross_margin' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-[#6E5040]">Product Gross Profit</div>
                      <div className="text-xl font-mono tabular-nums font-semibold text-[#231914]">
                        {formatPHP(metrics.grossProfit)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-[#6E5040]">Gross Margin</div>
                      <div className="text-xl font-mono tabular-nums font-semibold text-[#166534]">
                        {metrics.grossMarginPct}%
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-[#6E5040] pt-2 border-t border-[#F4EFE8]">
                    Ingredient COGS: <span className="font-mono tabular-nums">{formatPHP(metrics.totalIngredientCost)}</span>. Operating expenses (rent, utilities, payroll) are not recorded in this system and are excluded.
                  </div>
                </div>
              )}

              {widgetId === 'payments_cash' && (
                <div className="space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[#6E5040]">Pending Digital Verifications</span>
                    <span className="font-mono font-semibold text-[#B45309]">{metrics.pendingPayments.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#6E5040]">Active Cash Shift</span>
                    <span className="font-mono font-semibold text-[#231914]">
                      {metrics.openShift
                        ? `${metrics.openShift.cashierName} · ${formatPHP(metrics.openShift.expectedCash)}`
                        : 'No open shift'}
                    </span>
                  </div>
                  <Link to="/app/cash-drawer" className="inline-block text-[#231914] font-medium underline pt-1">
                    Manage Cash Drawer & Reconciliation
                  </Link>
                </div>
              )}

              {widgetId === 'kds_queue' && (
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[#6E5040]">Active Preparation Items</span>
                    <span className="font-mono text-lg font-semibold text-[#231914]">{metrics.activeKdsItems.length}</span>
                  </div>
                  <Link to="/app/kds" className="inline-block text-[#231914] font-medium underline pt-1">
                    Open Kitchen Display System
                  </Link>
                </div>
              )}

              {widgetId === 'deliveries' && (
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[#6E5040]">Active Deliveries</span>
                    <span className="font-mono text-lg font-semibold">{cafeState.deliveries.length}</span>
                  </div>
                  <Link to="/app/delivery" className="inline-block text-[#231914] font-medium underline">
                    Open Delivery Dispatch
                  </Link>
                </div>
              )}

              {widgetId === 'alerts' && (
                <div className="space-y-2">
                  {cafeState.notifications.slice(0, 4).map((n) => (
                    <div key={n.id} className="text-xs border-b border-[#FAF8F5] pb-2 last:border-0">
                      <div className="font-medium text-[#231914]">{n.title}</div>
                      <div className="text-[#6E5040]">{n.message}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
