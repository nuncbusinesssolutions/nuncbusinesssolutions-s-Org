import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ExternalLink, Printer, XCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Order, OrderStatus } from '../types/cafe';
import { formatManilaTime, formatPHP } from '../lib/businessLogic';
import { ReceiptPrinterModal } from '../components/ReceiptPrinterModal';

export const OrdersPage: React.FC = () => {
  const { cafeState, can, confirmPendingOrder, completeOrder, cancelOrder, transferTableOrder, notify } = useApp();
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all');
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  const [cancellingOrder, setCancellingOrder] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return cafeState.orders;
    return cafeState.orders.filter((o) => o.status === statusFilter);
  }, [cafeState.orders, statusFilter]);

  const handleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingOrder) return;
    try {
      await cancelOrder(cancellingOrder.id, cancelReason);
      setCancellingOrder(null);
      setCancelReason('');
    } catch (err) {
      notify('error', (err as Error).message);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-white border border-[#E8DFD3] rounded-lg overflow-x-auto">
          {(['all', 'pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize whitespace-nowrap ${
                statusFilter === s ? 'bg-[#231914] text-white' : 'text-[#523B2F] hover:bg-[#FAF8F5]'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-[#E8DFD3] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E8DFD3] bg-[#FAF8F5] text-xs font-semibold text-[#523B2F]">
                <th className="py-3 px-4">Order / Queue</th>
                <th className="py-3 px-4">Channel & Type</th>
                <th className="py-3 px-4">Items</th>
                <th className="py-3 px-4">Order Status</th>
                <th className="py-3 px-4">Payment Status</th>
                <th className="py-3 px-4 text-right">Total</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F4EFE8] text-xs">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[#6E5040]">
                    No orders matching this filter.
                  </td>
                </tr>
              ) : (
                filtered.map((ord) => {
                  const tbl = cafeState.tables.find((t) => t.id === ord.tableId);
                  return (
                    <tr key={ord.id} className="hover:bg-[#FAF8F5]">
                      <td className="py-3 px-4">
                        <div className="font-mono font-semibold text-[#231914]">{ord.orderNumber}</div>
                        <div className="text-[11px] text-[#6E5040]">
                          Queue {ord.queueNumber} · {formatManilaTime(ord.createdAt)}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium capitalize text-[#231914]">
                          {ord.channel.replace('_', ' ')} · {ord.orderType.replace('_', ' ')}
                        </div>
                        {tbl && (
                          <div className="text-[11px] text-[#6E5040] flex items-center gap-2 mt-0.5">
                            <span>Table {tbl.tableNumber}</span>
                            {!['completed', 'cancelled'].includes(ord.status) && (
                              <select
                                aria-label={`Transfer table for ${ord.orderNumber}`}
                                value={ord.tableId}
                                onChange={(e) => transferTableOrder(ord.id, e.target.value)}
                                className="border border-[#D7C8B6] rounded px-1 py-0.5 text-[10px] bg-white"
                              >
                                {cafeState.tables.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    Move → {t.tableNumber}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {ord.items.map((i) => (
                          <div key={i.id}>
                            {i.quantity}x {i.productName}
                          </div>
                        ))}
                      </td>
                      <td className="py-3 px-4 font-medium capitalize">{ord.status}</td>
                      <td className="py-3 px-4 font-medium capitalize">{ord.paymentStatus.replace('_', ' ')}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                        {formatPHP(ord.totalAmount)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {ord.status === 'pending' && can('orders', 'approve') && (
                            <button
                              onClick={() => confirmPendingOrder(ord.id)}
                              className="px-2.5 py-1 bg-[#231914] text-white rounded text-[11px] font-medium"
                            >
                              Approve
                            </button>
                          )}
                          {ord.status === 'ready' && (
                            <button
                              onClick={() => completeOrder(ord.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#166534] text-white rounded text-[11px] font-medium"
                            >
                              <Check className="w-3 h-3" /> Complete
                            </button>
                          )}
                          <button
                            onClick={() => setReceiptOrder(ord)}
                            className="p-1.5 border border-[#D7C8B6] rounded hover:bg-[#F4EFE8]"
                            title="Print receipt"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          <Link
                            to={`/track/${ord.trackingToken}`}
                            className="p-1.5 border border-[#D7C8B6] rounded hover:bg-[#F4EFE8]"
                            title="Customer tracking link"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Link>
                          {!['completed', 'cancelled'].includes(ord.status) && (
                            <button
                              onClick={() => setCancellingOrder(ord)}
                              className="p-1.5 border border-[#FECACA] text-[#991B1B] rounded hover:bg-[#FEF2F2]"
                              title="Cancel order"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {cancellingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={handleCancelSubmit} className="bg-white border border-[#E8DFD3] rounded-xl max-w-md w-full p-5 space-y-4">
            <h3 className="font-semibold text-base text-[#231914]">
              Cancel Order {cancellingOrder.orderNumber}
            </h3>
            <p className="text-xs text-[#523B2F]">
              {['preparing', 'ready'].includes(cancellingOrder.status)
                ? 'Preparation has already started. Ingredients consumed will NOT be automatically restored; manager approval is enforced.'
                : 'Active ingredient reservations will be released atomically.'}
            </p>
            <textarea
              required
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Required cancellation reason for audit log..."
              className="w-full px-3 py-2 text-xs border border-[#D7C8B6] rounded-lg"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancellingOrder(null)}
                className="px-4 py-2 text-xs border border-[#D7C8B6] rounded-lg"
              >
                Keep Order
              </button>
              <button type="submit" className="px-4 py-2 text-xs font-medium bg-[#991B1B] text-white rounded-lg">
                Confirm Cancel
              </button>
            </div>
          </form>
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
