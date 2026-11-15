import React, { useState } from 'react';
import { AlertTriangle, ArrowDownUp, Barcode, Plus } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatManilaTime, formatPHP, round2 } from '../lib/businessLogic';
import { ingredientSchema } from '../lib/validation';

export const InventoryPage: React.FC = () => {
  const { cafeState, stockAdjustIngredient, createIngredient, notify } = useApp();

  const [tab, setTab] = useState<'stock' | 'history'>('stock');
  const [barcodeQuery, setBarcodeQuery] = useState('');
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [adjustType, setAdjustType] = useState<'stock_in' | 'stock_out' | 'adjustment'>('stock_in');
  const [adjustQty, setAdjustQty] = useState<number>(1);
  const [usePurchaseUnit, setUsePurchaseUnit] = useState<boolean>(true);
  const [adjustReason, setAdjustReason] = useState('');

  const [showNew, setShowNew] = useState(false);
  const [newIng, setNewIng] = useState({
    name: '',
    categoryName: 'Coffee Beans',
    barcode: '',
    purchaseUnit: 'kg',
    recipeUnit: 'g',
    conversionRatio: 1000,
    currentStock: 1000,
    reorderPoint: 300,
    unitCost: 1.2,
  });

  const adjustingIng = cafeState.ingredients.find((i) => i.id === adjustingId);

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingIng) return;
    try {
      const qtyInRecipeUnits = usePurchaseUnit
        ? adjustQty * adjustingIng.conversionRatio
        : adjustQty;
      await stockAdjustIngredient(adjustingIng.id, qtyInRecipeUnits, adjustType, adjustReason);
      setAdjustingId(null);
      setAdjustReason('');
    } catch (err) {
      notify('error', (err as Error).message);
    }
  };

  const handleCreateIng = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const parsed = ingredientSchema.parse(newIng);
      await createIngredient({
        name: parsed.name,
        categoryName: parsed.categoryName,
        barcode: parsed.barcode || undefined,
        purchaseUnit: parsed.purchaseUnit,
        recipeUnit: parsed.recipeUnit,
        conversionRatio: parsed.conversionRatio,
        currentStock: parsed.currentStock,
        reorderPoint: parsed.reorderPoint,
        unitCost: parsed.unitCost,
      });
      setShowNew(false);
      setNewIng({ ...newIng, name: '', barcode: '' });
    } catch (err) {
      notify('error', (err as Error).message);
    }
  };

  const filteredIngredients = cafeState.ingredients.filter((i) => {
    if (!barcodeQuery.trim()) return true;
    const q = barcodeQuery.toLowerCase();
    return i.name.toLowerCase().includes(q) || (i.barcode && i.barcode.toLowerCase().includes(q));
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-white border border-[#E8DFD3] rounded-lg">
          <button
            onClick={() => setTab('stock')}
            className={`px-4 py-1.5 text-xs font-medium rounded-md ${
              tab === 'stock' ? 'bg-[#231914] text-white' : 'text-[#523B2F]'
            }`}
          >
            Ingredient Balances & Reservations
          </button>
          <button
            onClick={() => setTab('history')}
            className={`px-4 py-1.5 text-xs font-medium rounded-md ${
              tab === 'history' ? 'bg-[#231914] text-white' : 'text-[#523B2F]'
            }`}
          >
            Movement Ledger ({cafeState.movements.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Barcode className="w-4 h-4 text-[#8B6956] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={barcodeQuery}
              onChange={(e) => setBarcodeQuery(e.target.value)}
              placeholder="Scan ingredient barcode..."
              className="pl-9 pr-3 py-2 text-xs border border-[#D7C8B6] bg-white rounded-lg"
            />
          </div>
          <button
            onClick={() => setShowNew((v) => !v)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-[#231914] text-white rounded-lg"
          >
            <Plus className="w-3.5 h-3.5" /> Add Ingredient
          </button>
        </div>
      </div>

      {showNew && (
        <form onSubmit={handleCreateIng} className="bg-white border border-[#E8DFD3] rounded-xl p-5 grid sm:grid-cols-4 gap-3">
          <input
            required
            placeholder="Ingredient Name *"
            value={newIng.name}
            onChange={(e) => setNewIng({ ...newIng, name: e.target.value })}
            className="px-3 py-2 text-xs border border-[#D7C8B6] rounded-lg"
          />
          <input
            placeholder="Category"
            value={newIng.categoryName}
            onChange={(e) => setNewIng({ ...newIng, categoryName: e.target.value })}
            className="px-3 py-2 text-xs border border-[#D7C8B6] rounded-lg"
          />
          <input
            placeholder="Barcode"
            value={newIng.barcode}
            onChange={(e) => setNewIng({ ...newIng, barcode: e.target.value })}
            className="px-3 py-2 text-xs font-mono border border-[#D7C8B6] rounded-lg"
          />
          <input
            placeholder="Purchase Unit (e.g. kg)"
            value={newIng.purchaseUnit}
            onChange={(e) => setNewIng({ ...newIng, purchaseUnit: e.target.value })}
            className="px-3 py-2 text-xs border border-[#D7C8B6] rounded-lg"
          />
          <input
            placeholder="Recipe Unit (e.g. g)"
            value={newIng.recipeUnit}
            onChange={(e) => setNewIng({ ...newIng, recipeUnit: e.target.value })}
            className="px-3 py-2 text-xs border border-[#D7C8B6] rounded-lg"
          />
          <input
            type="number"
            step="0.01"
            placeholder="Conversion Ratio"
            value={newIng.conversionRatio}
            onChange={(e) => setNewIng({ ...newIng, conversionRatio: Number(e.target.value) })}
            className="px-3 py-2 text-xs font-mono border border-[#D7C8B6] rounded-lg"
          />
          <input
            type="number"
            step="0.01"
            placeholder="Opening Stock (recipe unit)"
            value={newIng.currentStock}
            onChange={(e) => setNewIng({ ...newIng, currentStock: Number(e.target.value) })}
            className="px-3 py-2 text-xs font-mono border border-[#D7C8B6] rounded-lg"
          />
          <button type="submit" className="px-4 py-2 bg-[#231914] text-white text-xs font-medium rounded-lg">
            Save Ingredient
          </button>
        </form>
      )}

      {tab === 'stock' ? (
        <div className="bg-white border border-[#E8DFD3] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#E8DFD3] bg-[#FAF8F5] font-semibold text-[#523B2F]">
                  <th className="py-3 px-4">Ingredient</th>
                  <th className="py-3 px-4">Unit Conversion</th>
                  <th className="py-3 px-4 text-right">On Hand</th>
                  <th className="py-3 px-4 text-right">Reserved</th>
                  <th className="py-3 px-4 text-right">Available</th>
                  <th className="py-3 px-4 text-right">Unit Cost</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F4EFE8]">
                {filteredIngredients.map((ing) => {
                  const available = round2(ing.currentStock - ing.reservedStock);
                  const isLow = available <= ing.reorderPoint;
                  return (
                    <tr key={ing.id} className="hover:bg-[#FAF8F5]">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-[#231914]">{ing.name}</div>
                        <div className="text-[11px] text-[#6E5040]">
                          {ing.categoryName} {ing.barcode ? `· ${ing.barcode}` : ''}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-[#523B2F]">
                        1 {ing.purchaseUnit} = {ing.conversionRatio} {ing.recipeUnit}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        {round2(ing.currentStock)} {ing.recipeUnit}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-[#B45309]">
                        {round2(ing.reservedStock)} {ing.recipeUnit}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                        <span className={isLow ? 'text-[#991B1B] inline-flex items-center gap-1' : 'text-[#166534]'}>
                          {isLow && <AlertTriangle className="w-3.5 h-3.5" />}
                          {available} {ing.recipeUnit}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        {formatPHP(ing.unitCost)}/{ing.recipeUnit}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setAdjustingId(ing.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 border border-[#D7C8B6] rounded hover:bg-[#F4EFE8]"
                        >
                          <ArrowDownUp className="w-3 h-3" /> Stock In/Out
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-[#E8DFD3] rounded-xl overflow-hidden">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#E8DFD3] bg-[#FAF8F5] font-semibold text-[#523B2F]">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Ingredient</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4 text-right">Delta</th>
                <th className="py-3 px-4 text-right">Balance After</th>
                <th className="py-3 px-4">Reason & Actor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F4EFE8]">
              {cafeState.movements.map((mov) => {
                const ing = cafeState.ingredients.find((i) => i.id === mov.ingredientId);
                return (
                  <tr key={mov.id}>
                    <td className="py-3 px-4 font-mono text-[#6E5040]">{formatManilaTime(mov.createdAt)}</td>
                    <td className="py-3 px-4 font-semibold text-[#231914]">{ing?.name}</td>
                    <td className="py-3 px-4 capitalize">{mov.movementType.replace('_', ' ')}</td>
                    <td
                      className={`py-3 px-4 text-right font-mono tabular-nums font-semibold ${
                        mov.quantityDelta >= 0 ? 'text-[#166534]' : 'text-[#991B1B]'
                      }`}
                    >
                      {mov.quantityDelta >= 0 ? '+' : ''}
                      {round2(mov.quantityDelta)} {ing?.recipeUnit}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {round2(mov.balanceAfter)} {ing?.recipeUnit}
                    </td>
                    <td className="py-3 px-4">
                      <div>{mov.reason || 'System movement'}</div>
                      <div className="text-[11px] text-[#6E5040]">By {mov.createdBy}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {adjustingIng && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={handleAdjustSubmit} className="bg-white border border-[#E8DFD3] rounded-xl max-w-md w-full p-5 space-y-4">
            <h3 className="font-semibold text-base text-[#231914]">
              Adjust Stock: {adjustingIng.name}
            </h3>
            <div className="grid grid-cols-3 gap-1 p-1 bg-[#F4EFE8] rounded-lg">
              {(['stock_in', 'stock_out', 'adjustment'] as const).map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setAdjustType(t)}
                  className={`py-1.5 text-xs font-medium rounded-md capitalize ${
                    adjustType === t ? 'bg-white text-[#231914] shadow-sm' : 'text-[#6E5040]'
                  }`}
                >
                  {t.replace('_', ' ')}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                required
                value={adjustQty}
                onChange={(e) => setAdjustQty(Number(e.target.value))}
                className="flex-1 px-3 py-2 text-sm font-mono border border-[#D7C8B6] rounded-lg"
              />
              <select
                value={usePurchaseUnit ? 'purchase' : 'recipe'}
                onChange={(e) => setUsePurchaseUnit(e.target.value === 'purchase')}
                className="px-3 py-2 text-xs border border-[#D7C8B6] rounded-lg bg-white"
              >
                <option value="purchase">
                  {adjustingIng.purchaseUnit} (= {adjustingIng.conversionRatio} {adjustingIng.recipeUnit})
                </option>
                <option value="recipe">{adjustingIng.recipeUnit}</option>
              </select>
            </div>
            <input
              required
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              placeholder="Audit reason (e.g. Morning supplier delivery, physical count)"
              className="w-full px-3 py-2 text-xs border border-[#D7C8B6] rounded-lg"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAdjustingId(null)}
                className="px-4 py-2 text-xs border border-[#D7C8B6] rounded-lg"
              >
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 text-xs font-medium bg-[#231914] text-white rounded-lg">
                Commit Movement
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
