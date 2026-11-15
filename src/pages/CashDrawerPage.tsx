import React, { useState } from 'react';
import { CheckCircle2, DollarSign } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { calculateDenominationsTotal, formatManilaTime, formatPHP, PHP_DENOMINATIONS } from '../lib/businessLogic';
import { cashMovementSchema } from '../lib/validation';

export const CashDrawerPage: React.FC = () => {
  const { cafeState, can, openCashShift, addCashMovement, closeCashShift, approveCashShift, notify } = useApp();

  const openShift = cafeState.shifts.find((s) => s.status === 'open');
  const [openingAmount, setOpeningAmount] = useState(5000);
  const [blindCount, setBlindCount] = useState(false);

  const [movType, setMovType] = useState<'cash_in' | 'cash_out'>('cash_in');
  const [movAmount, setMovAmount] = useState(500);
  const [movReason, setMovReason] = useState('');

  const [showCloseModal, setShowCloseModal] = useState(false);
  const [denoms, setDenoms] = useState<Record<string, number>>({});
  const [closeNotes, setCloseNotes] = useState('');

  const countedTotal = calculateDenominationsTotal(denoms);

  const handleMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openShift) return;
    try {
      const parsed = cashMovementSchema.parse({ type: movType, amount: movAmount, reason: movReason });
      await addCashMovement(openShift.id, parsed.type, parsed.amount, parsed.reason);
      setMovReason('');
    } catch (err) {
      notify('error', (err as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      {!openShift ? (
        <div className="bg-white border border-[#E8DFD3] rounded-xl p-6 max-w-lg space-y-4">
          <h2 className="font-semibold text-base text-[#231914]">Open Cash Drawer Shift</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#523B2F] mb-1">Opening Float (₱)</label>
              <input
                type="number"
                value={openingAmount}
                onChange={(e) => setOpeningAmount(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono border border-[#D7C8B6] rounded-lg"
              />
            </div>
            <label className="flex items-center gap-2 text-xs pt-5 cursor-pointer">
              <input type="checkbox" checked={blindCount} onChange={(e) => setBlindCount(e.target.checked)} />
              Enable Blind Cash Count
            </label>
          </div>
          <button
            onClick={() => openCashShift(cafeState.cashDrawers[0]?.id ?? 'drw_1', openingAmount, blindCount)}
            className="px-4 py-2 bg-[#231914] text-white text-xs font-medium rounded-lg"
          >
            Start Shift
          </button>
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-6 items-start">
          <div className="bg-white border border-[#E8DFD3] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E8DFD3] pb-3">
              <div>
                <h2 className="font-semibold text-base text-[#231914]">Active Shift: {openShift.cashierName}</h2>
                <p className="text-xs text-[#6E5040]">Opened {formatManilaTime(openShift.openedAt)}</p>
              </div>
              <button
                onClick={() => setShowCloseModal(true)}
                className="px-4 py-2 bg-[#231914] text-white text-xs font-medium rounded-lg"
              >
                Close & Count Drawer
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-[#FAF8F5] rounded-lg">
                <div className="text-[#6E5040]">Opening Float</div>
                <div className="font-mono font-semibold text-sm mt-0.5">{formatPHP(openShift.openingCash)}</div>
              </div>
              <div className="p-3 bg-[#FAF8F5] rounded-lg">
                <div className="text-[#6E5040]">Cash Sales</div>
                <div className="font-mono font-semibold text-sm mt-0.5">{formatPHP(openShift.cashSalesExpected)}</div>
              </div>
              <div className="p-3 bg-[#FAF8F5] rounded-lg">
                <div className="text-[#6E5040]">Paid-In / Paid-Out</div>
                <div className="font-mono font-semibold text-sm mt-0.5">
                  +{formatPHP(openShift.cashInTotal)} / -{formatPHP(openShift.cashOutTotal)}
                </div>
              </div>
              <div className="p-3 bg-[#F4EFE8] rounded-lg">
                <div className="text-[#6E5040]">Expected Drawer Cash</div>
                <div className="font-mono font-bold text-sm mt-0.5">
                  {openShift.blindCount ? 'Hidden (Blind Count)' : formatPHP(openShift.expectedCash)}
                </div>
              </div>
            </div>

            <form onSubmit={handleMovement} className="pt-3 border-t border-[#E8DFD3] space-y-2">
              <div className="text-xs font-semibold text-[#231914]">Record Cash-In / Cash-Out</div>
              <div className="flex flex-wrap gap-2">
                <select
                  value={movType}
                  onChange={(e) => setMovType(e.target.value as 'cash_in' | 'cash_out')}
                  className="px-3 py-2 text-xs border border-[#D7C8B6] rounded-lg bg-white"
                >
                  <option value="cash_in">Cash-In (Paid In)</option>
                  <option value="cash_out">Cash-Out (Paid Out)</option>
                </select>
                <input
                  type="number"
                  value={movAmount}
                  onChange={(e) => setMovAmount(Number(e.target.value))}
                  className="w-28 px-3 py-2 text-xs font-mono border border-[#D7C8B6] rounded-lg"
                />
                <input
                  required
                  placeholder="Reason (e.g. Ice block petty cash) *"
                  value={movReason}
                  onChange={(e) => setMovReason(e.target.value)}
                  className="flex-1 min-w-[160px] px-3 py-2 text-xs border border-[#D7C8B6] rounded-lg"
                />
                <button type="submit" className="px-3 py-2 bg-[#3A2920] text-white text-xs font-medium rounded-lg">
                  Record
                </button>
              </div>
            </form>
          </div>

          <div className="bg-white border border-[#E8DFD3] rounded-xl p-5 space-y-3">
            <h3 className="font-semibold text-sm text-[#231914]">Drawer Cash Movements</h3>
            {openShift.movements.length === 0 ? (
              <div className="text-xs text-[#6E5040]">No paid-in or paid-out entries for this shift.</div>
            ) : (
              openShift.movements.map((m) => (
                <div key={m.id} className="flex items-center justify-between text-xs py-2 border-b border-[#F4EFE8]">
                  <div>
                    <div className="font-medium text-[#231914]">{m.reason}</div>
                    <div className="text-[11px] text-[#6E5040]">
                      {m.createdBy} · {formatManilaTime(m.createdAt)}
                    </div>
                  </div>
                  <span className={`font-mono font-semibold ${m.type === 'cash_in' ? 'text-[#166534]' : 'text-[#991B1B]'}`}>
                    {m.type === 'cash_in' ? '+' : '-'}
                    {formatPHP(m.amount)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Historical Shift Reconciliations */}
      <div className="bg-white border border-[#E8DFD3] rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#E8DFD3] font-semibold text-sm text-[#231914]">
          Shift Reconciliation History
        </div>
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-[#E8DFD3] bg-[#FAF8F5] font-semibold text-[#523B2F]">
              <th className="py-3 px-4">Cashier</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Expected</th>
              <th className="py-3 px-4 text-right">Actual Count</th>
              <th className="py-3 px-4 text-right">Variance</th>
              <th className="py-3 px-4 text-right">Approval</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F4EFE8]">
            {cafeState.shifts.map((s) => (
              <tr key={s.id}>
                <td className="py-3 px-4 font-medium">{s.cashierName}</td>
                <td className="py-3 px-4 capitalize">{s.status.replace('_', ' ')}</td>
                <td className="py-3 px-4 text-right font-mono tabular-nums">
                  {s.blindCount && s.status === 'open' ? 'Hidden' : formatPHP(s.expectedCash)}
                </td>
                <td className="py-3 px-4 text-right font-mono tabular-nums">
                  {s.actualCash !== undefined ? formatPHP(s.actualCash) : '—'}
                </td>
                <td
                  className={`py-3 px-4 text-right font-mono tabular-nums font-semibold ${
                    (s.variance ?? 0) < 0 ? 'text-[#991B1B]' : 'text-[#166534]'
                  }`}
                >
                  {s.variance !== undefined ? formatPHP(s.variance) : '—'}
                </td>
                <td className="py-3 px-4 text-right">
                  {s.status === 'pending_approval' && can('cash_drawer', 'approve') ? (
                    <button
                      onClick={() => approveCashShift(s.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#231914] text-white rounded text-[11px]"
                    >
                      <CheckCircle2 className="w-3 h-3" /> Approve Variance
                    </button>
                  ) : (
                    s.approvedByName ?? '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCloseModal && openShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white border border-[#E8DFD3] rounded-xl max-w-lg w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-base text-[#231914] flex items-center gap-2">
                <DollarSign className="w-4 h-4" /> Denomination Cash Count (PHP)
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-2.5 text-xs">
              {PHP_DENOMINATIONS.map((denom) => (
                <div key={denom} className="flex items-center justify-between gap-2 p-2 border border-[#E8DFD3] rounded-lg">
                  <span className="font-mono font-semibold">₱{denom}</span>
                  <input
                    type="number"
                    min={0}
                    value={denoms[String(denom)] ?? 0}
                    onChange={(e) =>
                      setDenoms({ ...denoms, [String(denom)]: Math.max(0, Number(e.target.value)) })
                    }
                    className="w-20 px-2 py-1 text-right font-mono border border-[#D7C8B6] rounded"
                  />
                </div>
              ))}
            </div>
            <div className="p-3 bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg flex justify-between text-sm font-semibold">
              <span>Counted Actual Cash</span>
              <span className="font-mono tabular-nums">{formatPHP(countedTotal)}</span>
            </div>
            <input
              placeholder="Shift handover or variance notes..."
              value={closeNotes}
              onChange={(e) => setCloseNotes(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-[#D7C8B6] rounded-lg"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCloseModal(false)}
                className="px-4 py-2 text-xs border border-[#D7C8B6] rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await closeCashShift(openShift.id, denoms, closeNotes);
                  setShowCloseModal(false);
                }}
                className="px-4 py-2 text-xs font-medium bg-[#231914] text-white rounded-lg"
              >
                Submit Shift Count
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
