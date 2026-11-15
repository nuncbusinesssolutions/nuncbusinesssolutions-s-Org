import React, { useState } from 'react';
import { Check, RotateCcw, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatManilaTime, formatPHP } from '../lib/businessLogic';

export const PaymentsPage: React.FC = () => {
  const { cafeState, can, verifyPayment, refundPayment, notify } = useApp();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [refundingId, setRefundingId] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState('');

  const handleVerify = async (paymentId: string, approve: boolean, reason?: string) => {
    try {
      await verifyPayment(paymentId, approve, reason);
      setRejectingId(null);
      setRejectReason('');
    } catch (err) {
      notify('error', (err as Error).message);
    }
  };

  const handleRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundingId) return;
    try {
      await refundPayment(refundingId, refundReason);
      setRefundingId(null);
      setRefundReason('');
    } catch (err) {
      notify('error', (err as Error).message);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-[#E8DFD3] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E8DFD3] flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-sm text-[#231914]">Payments, Verification & Refunds</h2>
            <p className="text-xs text-[#6E5040]">
              GCash, Maya, and Bank Transfer references remain Pending Verification until staff confirm receipt. Refunds require manager approval and an audit reason.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#E8DFD3] bg-[#FAF8F5] font-semibold text-[#523B2F]">
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Order</th>
                <th className="py-3 px-4">Method & Reference</th>
                <th className="py-3 px-4 text-right">Amount</th>
                <th className="py-3 px-4">Verification Status</th>
                <th className="py-3 px-4">Verified By</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F4EFE8]">
              {cafeState.payments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[#6E5040]">
                    No payment records yet.
                  </td>
                </tr>
              ) : (
                cafeState.payments.map((pay) => {
                  const ord = cafeState.orders.find((o) => o.id === pay.orderId);
                  return (
                    <tr key={pay.id} className="hover:bg-[#FAF8F5]">
                      <td className="py-3 px-4 font-mono text-[#6E5040]">{formatManilaTime(pay.createdAt)}</td>
                      <td className="py-3 px-4 font-mono font-semibold text-[#231914]">
                        {ord?.orderNumber ?? pay.orderId}
                      </td>
                      <td className="py-3 px-4">
                        <div className="uppercase font-semibold">{pay.method.replace('_', ' ')}</div>
                        {pay.referenceNumber && (
                          <div className="font-mono text-[11px] text-[#6E5040]">Ref: {pay.referenceNumber}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                        {formatPHP(pay.amount)}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`font-medium capitalize ${
                            pay.status === 'verified'
                              ? 'text-[#166534]'
                              : pay.status === 'rejected' || pay.status === 'refunded'
                                ? 'text-[#991B1B]'
                                : 'text-[#B45309]'
                          }`}
                        >
                          {pay.status.replace('_', ' ')}
                        </span>
                        {pay.rejectionReason && (
                          <div className="text-[11px] text-[#991B1B]">{pay.rejectionReason}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-[#523B2F]">{pay.verifiedByName ?? '—'}</td>
                      <td className="py-3 px-4 text-right">
                        {pay.status === 'pending_verification' && can('payments', 'approve') ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => handleVerify(pay.id, true)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#166534] text-white rounded text-[11px]"
                            >
                              <Check className="w-3 h-3" /> Verify
                            </button>
                            <button
                              onClick={() => setRejectingId(pay.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 border border-[#FECACA] text-[#991B1B] rounded text-[11px]"
                            >
                              <X className="w-3 h-3" /> Reject
                            </button>
                          </div>
                        ) : pay.status === 'verified' && can('payments', 'approve') ? (
                          <button
                            onClick={() => setRefundingId(pay.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 border border-[#FECACA] text-[#991B1B] rounded text-[11px] hover:bg-[#FEF2F2]"
                          >
                            <RotateCcw className="w-3 h-3" /> Refund / Void
                          </button>
                        ) : (
                          <span className="text-[#8B6956] capitalize">{pay.status === 'refunded' ? 'Refunded' : 'Recorded'}</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {rejectingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white border border-[#E8DFD3] rounded-xl max-w-md w-full p-5 space-y-4">
            <h3 className="font-semibold text-base text-[#231914]">Reject Payment Verification</h3>
            <input
              required
              placeholder="Required rejection reason (e.g. Reference not found in GCash merchant app)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-[#D7C8B6] rounded-lg"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRejectingId(null)}
                className="px-4 py-2 text-xs border border-[#D7C8B6] rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => handleVerify(rejectingId, false, rejectReason)}
                className="px-4 py-2 text-xs font-medium bg-[#991B1B] text-white rounded-lg"
              >
                Reject Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {refundingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={handleRefund} className="bg-white border border-[#E8DFD3] rounded-xl max-w-md w-full p-5 space-y-4">
            <h3 className="font-semibold text-base text-[#231914]">Refund / Void Verified Payment</h3>
            <p className="text-xs text-[#6E5040]">
              Refunding updates the order payment status, adjusts active cash drawer expected cash for cash refunds, and writes an immutable audit log entry.
            </p>
            <textarea
              required
              rows={3}
              placeholder="Required refund reason (e.g. Customer returned unopened order / double charge)..."
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-[#D7C8B6] rounded-lg"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRefundingId(null)}
                className="px-4 py-2 text-xs border border-[#D7C8B6] rounded-lg"
              >
                Keep Payment
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-medium bg-[#991B1B] text-white rounded-lg"
              >
                Confirm Refund
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
