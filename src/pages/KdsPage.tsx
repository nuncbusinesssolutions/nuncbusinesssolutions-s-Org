import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, Clock, Flame } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { KdsTicketStatus } from '../types/cafe';

export const KdsPage: React.FC = () => {
  const { cafeState, advanceKdsItem } = useApp();
  const [stationId, setStationId] = useState<string>('all');
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  const activeOrders = cafeState.orders.filter((o) =>
    ['confirmed', 'preparing', 'ready'].includes(o.status)
  );

  const visibleOrders = activeOrders
    .map((order) => {
      const stationItems = order.items.filter((item) => {
        if (item.kdsStatus === 'bumped' || item.kdsStatus === 'cancelled') return false;
        if (stationId !== 'all' && item.kdsStationId !== stationId) return false;
        return true;
      });
      return { order, stationItems };
    })
    .filter((entry) => entry.stationItems.length > 0)
    .sort((a, b) => Number(b.order.isPriority) - Number(a.order.isPriority));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-white border border-[#E8DFD3] rounded-lg">
          <button
            onClick={() => setStationId('all')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md ${
              stationId === 'all' ? 'bg-[#231914] text-white' : 'text-[#523B2F]'
            }`}
          >
            All Stations
          </button>
          {cafeState.kdsStations.map((st) => (
            <button
              key={st.id}
              onClick={() => setStationId(st.id)}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md ${
                stationId === st.id ? 'bg-[#231914] text-white' : 'text-[#523B2F]'
              }`}
            >
              {st.name}
            </button>
          ))}
        </div>
        <div className="text-xs text-[#6E5040]">
          Order marks Ready only after ALL items across stations are Ready.
        </div>
      </div>

      {visibleOrders.length === 0 ? (
        <div className="bg-white border border-[#E8DFD3] rounded-xl p-12 text-center text-sm text-[#6E5040]">
          No active preparation tickets for this station.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleOrders.map(({ order, stationItems }) => {
            const elapsedMin = Math.floor((nowMs - new Date(order.createdAt).getTime()) / 60000);
            const isOverdue = elapsedMin >= 8;
            const tbl = cafeState.tables.find((t) => t.id === order.tableId);

            return (
              <div
                key={order.id}
                className={`bg-white border rounded-xl overflow-hidden flex flex-col ${
                  isOverdue ? 'border-[#DC2626]' : 'border-[#E8DFD3]'
                }`}
              >
                <div
                  className={`px-4 py-3 border-b flex items-center justify-between ${
                    order.isPriority
                      ? 'bg-[#231914] text-white border-[#231914]'
                      : isOverdue
                        ? 'bg-[#FEF2F2] text-[#991B1B] border-[#FECACA]'
                        : 'bg-[#FAF8F5] text-[#231914] border-[#E8DFD3]'
                  }`}
                >
                  <div>
                    <div className="font-mono font-bold text-base flex items-center gap-2">
                      <span>{order.queueNumber}</span>
                      {order.isPriority && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-sans font-semibold">
                          <Flame className="w-3.5 h-3.5" /> Priority
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] opacity-80">
                      {order.orderType.replace('_', ' ')} {tbl ? `· ${tbl.tableNumber}` : ''} · {order.orderNumber}
                    </div>
                  </div>
                  <div className="text-right font-mono text-xs flex items-center gap-1">
                    {isOverdue ? <AlertTriangle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                    <span>{elapsedMin}m</span>
                  </div>
                </div>

                <div className="p-4 space-y-3 flex-1">
                  {stationItems.map((item) => {
                    const st = cafeState.kdsStations.find((s) => s.id === item.kdsStationId);
                    const nextAction: { label: string; next: KdsTicketStatus } | null =
                      item.kdsStatus === 'queued'
                        ? { label: 'Start Prep (Consume Stock)', next: 'preparing' }
                        : item.kdsStatus === 'preparing'
                          ? { label: 'Mark Ready', next: 'ready' }
                          : item.kdsStatus === 'ready'
                            ? { label: 'Bump Ticket', next: 'bumped' }
                            : null;

                    return (
                      <div key={item.id} className="p-3 border border-[#E8DFD3] rounded-lg space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-semibold text-[#231914]">
                              {item.quantity}x {item.productName}
                            </div>
                            {item.variantName && (
                              <div className="text-xs text-[#6E5040]">{item.variantName}</div>
                            )}
                            {item.modifiers.length > 0 && (
                              <div className="text-xs text-[#523B2F] mt-0.5">
                                {item.modifiers.map((m) => m.optionName).join(' · ')}
                              </div>
                            )}
                            {item.notes && (
                              <div className="text-xs italic text-[#92400E] mt-1">Note: {item.notes}</div>
                            )}
                          </div>
                          <span className="text-[10px] font-mono uppercase text-[#6E5040] shrink-0">
                            {st?.code} · {item.kdsStatus}
                          </span>
                        </div>

                        {nextAction && (
                          <button
                            onClick={() => advanceKdsItem(order.id, item.id, nextAction.next)}
                            className={`w-full py-2 text-xs font-medium rounded-lg inline-flex items-center justify-center gap-1.5 ${
                              item.kdsStatus === 'queued'
                                ? 'bg-[#231914] text-white hover:bg-[#3A2920]'
                                : item.kdsStatus === 'preparing'
                                  ? 'bg-[#166534] text-white hover:bg-[#15803D]'
                                  : 'bg-[#F4EFE8] text-[#231914] hover:bg-[#E8DFD3]'
                            }`}
                          >
                            <Check className="w-3.5 h-3.5" />
                            {nextAction.label}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
