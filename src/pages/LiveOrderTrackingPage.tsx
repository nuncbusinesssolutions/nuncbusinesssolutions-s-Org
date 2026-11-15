import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, Clock } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatManilaTime, formatPHP } from '../lib/businessLogic';
import { getSupabaseClient } from '../services/supabaseClient';

const STEPS = ['pending', 'confirmed', 'preparing', 'ready', 'completed'] as const;

interface TrackedOrderView {
  orderNumber: string;
  queueNumber: string;
  orderType: string;
  status: string;
  paymentStatus: string;
  totalAmount: number;
  createdAt: string;
  updatedAt: string;
  items: Array<{
    id: string;
    productName: string;
    variantName?: string;
    quantity: number;
    lineTotal: number;
    kdsStatus: string;
  }>;
}

export const LiveOrderTrackingPage: React.FC = () => {
  const { orderToken } = useParams<{ orderToken: string }>();
  const { envMode, cafeState } = useApp();
  const [prodOrder, setProdOrder] = useState<TrackedOrderView | null>(null);
  const [loading, setLoading] = useState(envMode === 'production');

  useEffect(() => {
    if (envMode !== 'production' || !orderToken) {
      setLoading(false);
      return;
    }
    const sb = getSupabaseClient();
    if (!sb) {
      setLoading(false);
      return;
    }

    const fetchTracked = async () => {
      const { data } = await sb.rpc('get_order_tracking_by_token', {
        p_tracking_token: orderToken,
      });
      setProdOrder((data as TrackedOrderView | null) ?? null);
      setLoading(false);
    };

    void fetchTracked();
    const timer = setInterval(fetchTracked, 5000);
    return () => clearInterval(timer);
  }, [envMode, orderToken]);

  const demoOrder =
    envMode === 'demo' ? cafeState.orders.find((o) => o.trackingToken === orderToken) ?? null : null;
  const order: TrackedOrderView | null = envMode === 'production' ? prodOrder : demoOrder;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center p-6">
        <div className="bg-white border border-[#E8DFD3] rounded-xl p-8 text-center text-xs text-[#6E5040]">
          Loading order tracking status...
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center p-6">
        <div className="bg-white border border-[#E8DFD3] rounded-xl p-8 text-center space-y-3">
          <h1 className="font-['Fraunces'] text-xl font-semibold">Order Not Found</h1>
          <p className="text-xs text-[#6E5040]">This tracking link is invalid or expired.</p>
          <Link to="/queue" className="text-xs underline text-[#523B2F]">
            View Public Queue
          </Link>
        </div>
      </div>
    );
  }

  const currentIdx = STEPS.indexOf(order.status as (typeof STEPS)[number]);

  return (
    <div className="min-h-screen bg-[#FAF8F5] py-10 px-4">
      <div className="max-w-lg mx-auto bg-white border border-[#E8DFD3] rounded-xl p-6 space-y-6">
        <div className="border-b border-[#E8DFD3] pb-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-[#6E5040]">{cafeState.business.businessName}</div>
            <h1 className="font-['Fraunces'] text-2xl font-semibold text-[#231914] mt-0.5">
              Queue {order.queueNumber}
            </h1>
            <div className="text-xs font-mono text-[#6E5040] mt-0.5">
              {order.orderNumber} · {formatManilaTime(order.createdAt)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-[#6E5040]">Payment</div>
            <div className="text-xs font-semibold uppercase text-[#231914]">
              {order.paymentStatus.replace('_', ' ')}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {order.status === 'cancelled' ? (
            <div className="p-4 bg-[#FEF2F2] border border-[#FECACA] rounded-lg text-sm font-semibold text-[#991B1B]">
              This order has been cancelled.
            </div>
          ) : (
            STEPS.map((st, idx) => {
              const done = currentIdx >= idx;
              return (
                <div key={st} className="flex items-center gap-3 text-xs">
                  {done ? (
                    <CheckCircle2 className="w-4 h-4 text-[#166534] shrink-0" />
                  ) : (
                    <Clock className="w-4 h-4 text-[#A98976] shrink-0" />
                  )}
                  <span className={`capitalize ${done ? 'font-semibold text-[#231914]' : 'text-[#8B6956]'}`}>
                    {st === 'pending' ? 'Awaiting Store Confirmation' : st}
                  </span>
                </div>
              );
            })
          )}
        </div>

        <div className="border-t border-[#E8DFD3] pt-4 space-y-2 text-xs">
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between">
              <span>
                {item.quantity}x {item.productName}
              </span>
              <span className="font-mono tabular-nums">{formatPHP(item.lineTotal)}</span>
            </div>
          ))}
          <div className="flex justify-between font-bold text-sm pt-2 border-t border-[#F4EFE8]">
            <span>Total</span>
            <span className="font-mono tabular-nums">{formatPHP(order.totalAmount)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
