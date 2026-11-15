import React, { useState } from 'react';
import { Truck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { DeliveryStatus } from '../types/cafe';
import { formatPHP } from '../lib/businessLogic';

export const DeliveryPage: React.FC = () => {
  const { cafeState, assignDeliveryRider, updateDeliveryStatus, notify } = useApp();
  const riders = cafeState.users.filter((u) => u.roleKey === 'rider');
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [otpById, setOtpById] = useState<Record<string, string>>({});

  const handleStatusChange = async (deliveryId: string, nextStatus: DeliveryStatus) => {
    try {
      await updateDeliveryStatus(deliveryId, nextStatus, otpById[deliveryId], notesById[deliveryId]);
    } catch (err) {
      notify('error', (err as Error).message);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-[#E8DFD3] rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Truck className="w-4 h-4 text-[#231914]" />
          <h2 className="font-semibold text-sm text-[#231914]">Active Delivery Dispatch & Proof Workflow</h2>
        </div>

        {cafeState.deliveries.length === 0 ? (
          <div className="py-10 text-center text-xs text-[#6E5040]">
            No delivery orders yet. Create a Delivery order from POS or Online Ordering to see dispatch tickets here.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {cafeState.deliveries.map((del) => {
              const ord = cafeState.orders.find((o) => o.id === del.orderId);
              return (
                <div key={del.id} className="border border-[#E8DFD3] rounded-xl p-4 space-y-3 text-xs">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-mono font-bold text-sm text-[#231914]">
                        {ord?.orderNumber ?? del.orderId}
                      </div>
                      <div className="text-[#523B2F] mt-0.5">
                        {del.customerName} · {del.customerPhone}
                      </div>
                    </div>
                    <span className="font-mono font-semibold text-[#231914]">
                      Fee: {formatPHP(del.deliveryFee)}
                    </span>
                  </div>

                  <div className="p-2.5 bg-[#FAF8F5] rounded-lg text-[#523B2F]">
                    <div><strong>Address:</strong> {del.address}</div>
                    {del.deliveryInstructions && (
                      <div className="mt-1"><strong>Instructions:</strong> {del.deliveryInstructions}</div>
                    )}
                    {del.otpCode && (
                      <div className="mt-1 font-mono">
                        <strong>Dispatch OTP Reference:</strong> {del.otpCode}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={del.riderId ?? ''}
                      onChange={async (e) => {
                        try {
                          if (e.target.value) await assignDeliveryRider(del.id, e.target.value);
                        } catch (err) {
                          notify('error', (err as Error).message);
                        }
                      }}
                      className="flex-1 min-w-[160px] px-2.5 py-1.5 border border-[#D7C8B6] rounded-lg bg-white"
                    >
                      <option value="">Assign Rider...</option>
                      {riders.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.fullName}
                        </option>
                      ))}
                    </select>

                    <select
                      value={del.deliveryStatus}
                      onChange={(e) => handleStatusChange(del.id, e.target.value as DeliveryStatus)}
                      className="px-2.5 py-1.5 border border-[#D7C8B6] rounded-lg bg-white capitalize"
                    >
                      <option value="unassigned">Unassigned</option>
                      <option value="assigned">Assigned</option>
                      <option value="picked_up">Picked Up</option>
                      <option value="in_transit">In Transit</option>
                      <option value="delivered">Delivered (Verify OTP)</option>
                      <option value="failed">Failed (Reason Required)</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-2">
                    <input
                      placeholder="Customer OTP *"
                      value={otpById[del.id] ?? ''}
                      onChange={(e) => setOtpById({ ...otpById, [del.id]: e.target.value })}
                      className="px-2.5 py-1.5 border border-[#D7C8B6] rounded-lg font-mono"
                    />
                    <input
                      placeholder="Rider proof notes / failed-delivery reason..."
                      value={notesById[del.id] ?? del.riderNotes ?? del.failedReason ?? ''}
                      onChange={(e) => setNotesById({ ...notesById, [del.id]: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-[#D7C8B6] rounded-lg"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
