import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCircle2, Move, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useApp } from '../context/AppContext';
import { DiningTable, TableStatus } from '../types/cafe';
import { formatManilaTime, formatPHP } from '../lib/businessLogic';

export const TablesPage: React.FC = () => {
  const { cafeState, moveTableOnFloor, updateTableStatus, resolveServiceRequest } = useApp();
  const [selectedZoneId, setSelectedZoneId] = useState<string>(cafeState.zones[0]?.id ?? '');
  const [editLayout, setEditLayout] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<DiningTable | null>(cafeState.tables[0] ?? null);

  const zoneTables = cafeState.tables.filter((t) => t.zoneId === selectedZoneId);
  const openRequests = cafeState.serviceRequests.filter((r) => r.status !== 'resolved');

  const handleCanvasDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (!editLayout || !draggingId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - 48;
    const y = e.clientY - rect.top - 48;
    moveTableOnFloor(draggingId, x, y);
    setDraggingId(null);
  };

  const activeTableOrders = selectedTable
    ? cafeState.orders.filter(
        (o) => o.tableId === selectedTable.id && !['completed', 'cancelled'].includes(o.status)
      )
    : [];

  return (
    <div className="space-y-6">
      {openRequests.length > 0 && (
        <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#92400E]">
            <Bell className="w-4 h-4" />
            Active Table Service Requests ({openRequests.length})
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {openRequests.map((req) => {
              const tbl = cafeState.tables.find((t) => t.id === req.tableId);
              return (
                <div
                  key={req.id}
                  className="bg-white border border-[#FDE68A] rounded-lg px-3 py-2 flex items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <div className="font-semibold text-[#231914]">
                      {tbl?.tableNumber} · {req.requestType === 'call_waiter' ? 'Call Waiter' : 'Request Bill'}
                    </div>
                    <div className="text-[11px] text-[#6E5040]">{formatManilaTime(req.createdAt)}</div>
                  </div>
                  <button
                    onClick={() => resolveServiceRequest(req.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#231914] text-white rounded text-[11px]"
                  >
                    <CheckCircle2 className="w-3 h-3" /> Resolve
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-white border border-[#E8DFD3] rounded-lg">
          {cafeState.zones.map((z) => (
            <button
              key={z.id}
              onClick={() => setSelectedZoneId(z.id)}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md ${
                selectedZoneId === z.id ? 'bg-[#231914] text-white' : 'text-[#523B2F]'
              }`}
            >
              {z.name}
            </button>
          ))}
        </div>

        <button
          onClick={() => setEditLayout((v) => !v)}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border ${
            editLayout
              ? 'bg-[#231914] text-white border-[#231914]'
              : 'bg-white text-[#231914] border-[#D7C8B6]'
          }`}
        >
          <Move className="w-3.5 h-3.5" />
          {editLayout ? 'Save Floor Positions' : 'Edit Floor Plan'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
        {/* Interactive Visual Floor Canvas */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleCanvasDrop}
          className="relative bg-white border border-[#E8DFD3] rounded-xl min-h-[420px] overflow-auto"
          style={{
            backgroundImage: 'radial-gradient(#E8DFD3 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        >
          {zoneTables.map((tbl) => {
            const isSelected = selectedTable?.id === tbl.id;
            const statusStyle =
              tbl.status === 'available'
                ? 'bg-[#F0FDF4] border-[#86EFAC] text-[#166534]'
                : tbl.status === 'occupied'
                  ? 'bg-[#FEF2F2] border-[#FCA5A5] text-[#991B1B]'
                  : tbl.status === 'reserved'
                    ? 'bg-[#FFFBEB] border-[#FCD34D] text-[#92400E]'
                    : 'bg-[#F3F4F6] border-[#D1D5DB] text-[#4B5563]';

            return (
              <div
                key={tbl.id}
                draggable={editLayout}
                onDragStart={() => setDraggingId(tbl.id)}
                onClick={() => setSelectedTable(tbl)}
                style={{
                  left: tbl.posX,
                  top: tbl.posY,
                  width: tbl.width,
                  height: tbl.height,
                }}
                className={`absolute p-2 border-2 flex flex-col items-center justify-center cursor-pointer transition-shadow ${
                  tbl.shape === 'round' ? 'rounded-full' : 'rounded-xl'
                } ${statusStyle} ${isSelected ? 'ring-2 ring-[#231914] ring-offset-2' : ''}`}
              >
                <span className="font-mono font-bold text-sm">{tbl.tableNumber}</span>
                <span className="text-[11px]">{tbl.seats} seats</span>
                <span className="text-[10px] capitalize">{tbl.status}</span>
              </div>
            );
          })}
        </div>

        {/* Selected Table Inspector & QR */}
        {selectedTable && (
          <div className="bg-white border border-[#E8DFD3] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E8DFD3] pb-3">
              <div>
                <h3 className="font-semibold text-base text-[#231914]">
                  Table {selectedTable.tableNumber}
                </h3>
                <p className="text-xs text-[#6E5040]">{selectedTable.seats} seats</p>
              </div>
              <select
                value={selectedTable.status}
                onChange={(e) => {
                  const st = e.target.value as TableStatus;
                  updateTableStatus(selectedTable.id, st);
                  setSelectedTable({ ...selectedTable, status: st });
                }}
                className="px-2.5 py-1.5 text-xs border border-[#D7C8B6] rounded-lg bg-white"
              >
                <option value="available">Available</option>
                <option value="occupied">Occupied</option>
                <option value="reserved">Reserved</option>
                <option value="unavailable">Unavailable</option>
              </select>
            </div>

            <div className="p-4 bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg flex flex-col items-center gap-2 text-center">
              <QRCodeSVG
                value={`${window.location.origin}/qr/${selectedTable.qrToken}`}
                size={128}
              />
              <div className="text-xs font-medium text-[#231914] flex items-center gap-1">
                <QrCode className="w-3.5 h-3.5" /> Unique Table QR Code
              </div>
              <Link
                to={`/qr/${selectedTable.qrToken}`}
                className="text-xs text-[#523B2F] underline"
              >
                Open Customer QR Ordering Page
              </Link>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-[#231914]">
                Active Table Orders ({activeTableOrders.length})
              </div>
              {activeTableOrders.length === 0 ? (
                <div className="text-xs text-[#6E5040]">No active orders on this table.</div>
              ) : (
                activeTableOrders.map((ord) => (
                  <div
                    key={ord.id}
                    className="p-2.5 border border-[#E8DFD3] rounded-lg text-xs flex items-center justify-between"
                  >
                    <div>
                      <div className="font-mono font-semibold">{ord.orderNumber}</div>
                      <div className="text-[11px] text-[#6E5040] capitalize">
                        {ord.status} · {ord.paymentStatus.replace('_', ' ')}
                      </div>
                    </div>
                    <span className="font-mono font-semibold tabular-nums">
                      {formatPHP(ord.totalAmount)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
