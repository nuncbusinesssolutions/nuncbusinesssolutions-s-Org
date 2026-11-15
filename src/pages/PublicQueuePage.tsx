import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { getSupabaseClient } from '../services/supabaseClient';

interface QueueRow {
  id: string;
  queueNumber: string;
  orderType: string;
  status: string;
}

export const PublicQueuePage: React.FC = () => {
  const { envMode, cafeState } = useApp();
  const [prodQueue, setProdQueue] = useState<QueueRow[]>([]);

  useEffect(() => {
    if (envMode !== 'production') return;
    const sb = getSupabaseClient();
    if (!sb) return;

    const loadQueue = async () => {
      const { data } = await sb
        .from('public_order_queue')
        .select('id, queue_number, order_type, status')
        .eq('env_mode', 'production');
      if (data) {
        setProdQueue(
          data.map((r) => ({
            id: r.id,
            queueNumber: r.queue_number,
            orderType: r.order_type,
            status: r.status,
          }))
        );
      }
    };

    void loadQueue();
    const timer = setInterval(loadQueue, 5000);
    return () => clearInterval(timer);
  }, [envMode]);

  const queueSource: QueueRow[] =
    envMode === 'production'
      ? prodQueue
      : cafeState.orders
          .filter((o) => o.status === 'confirmed' || o.status === 'preparing' || o.status === 'ready')
          .map((o) => ({
            id: o.id,
            queueNumber: o.queueNumber,
            orderType: o.orderType,
            status: o.status,
          }));

  // Strictly non-PII queue projection
  const preparing = queueSource.filter((o) => o.status === 'confirmed' || o.status === 'preparing');
  const ready = queueSource.filter((o) => o.status === 'ready');

  return (
    <div className="min-h-screen bg-[#231914] text-[#FAF8F5] p-6 sm:p-10 flex flex-col">
      <header className="flex items-center justify-between border-b border-white/15 pb-5 mb-8">
        <div>
          <h1 className="font-['Fraunces'] text-2xl sm:text-3xl font-semibold">
            {cafeState.business.businessName} · Order Queue
          </h1>
          <p className="text-xs text-[#D7C8B6] mt-1">{cafeState.branch.name}</p>
        </div>
        <Link
          to="/app"
          className="px-4 py-2 text-xs font-medium border border-white/25 rounded-lg hover:bg-white/10"
        >
          Back to Staff Console
        </Link>
      </header>

      <div className="grid md:grid-cols-2 gap-8 flex-1">
        <div className="bg-[#2D211B] border border-white/10 rounded-2xl p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[#D7C8B6] border-b border-white/10 pb-3 mb-4">
            Preparing ({preparing.length})
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {preparing.map((o) => (
              <div key={o.id} className="bg-[#231914] border border-white/10 rounded-xl p-4 text-center">
                <div className="font-mono text-2xl font-bold">{o.queueNumber}</div>
                <div className="text-[11px] text-[#D7C8B6] uppercase mt-1">{o.orderType.replace('_', ' ')}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#166534]/20 border border-[#86EFAC]/30 rounded-2xl p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[#BBF7D0] border-b border-white/10 pb-3 mb-4">
            Ready for Pickup ({ready.length})
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {ready.map((o) => (
              <div key={o.id} className="bg-[#166534] text-white rounded-xl p-4 text-center">
                <div className="font-mono text-3xl font-bold">{o.queueNumber}</div>
                <div className="text-[11px] uppercase mt-1 opacity-90">{o.orderType.replace('_', ' ')}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
