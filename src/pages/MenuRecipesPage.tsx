import React, { useState } from 'react';
import { Plus, ShieldAlert } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { calculateRecipeUnitCost, formatPHP, isProductPreparable, round2 } from '../lib/businessLogic';
import { productSchema } from '../lib/validation';

export const MenuRecipesPage: React.FC = () => {
  const { cafeState, createProduct, overrideProductAvailability, saveRecipeForProduct, notify } = useApp();

  const [tab, setTab] = useState<'menu' | 'recipes'>('menu');
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [form, setForm] = useState({
    name: '',
    sku: '',
    barcode: '',
    categoryId: cafeState.categories[0]?.id ?? '',
    kdsStationId: cafeState.kdsStations[0]?.id ?? '',
    description: '',
    basePrice: 165,
    isFeatured: false,
  });

  const [selectedRecipeProductId, setSelectedRecipeProductId] = useState(cafeState.products[0]?.id ?? '');
  const activeRecipe = cafeState.recipes.find((r) => r.productId === selectedRecipeProductId);
  const [newIngredientId, setNewIngredientId] = useState(cafeState.ingredients[0]?.id ?? '');
  const [newQty, setNewQty] = useState<number>(15);

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const parsed = productSchema.parse(form);
      await createProduct({
        name: parsed.name,
        sku: parsed.sku,
        barcode: parsed.barcode || undefined,
        categoryId: parsed.categoryId,
        kdsStationId: parsed.kdsStationId,
        description: parsed.description,
        basePrice: parsed.basePrice,
        isFeatured: parsed.isFeatured,
        variants: [{ id: `var_${Date.now()}`, productId: '', name: 'Regular', priceDelta: 0, isDefault: true }],
        modifierGroupIds: [],
      });
      setShowAddProduct(false);
      setForm({ ...form, name: '', sku: '', barcode: '', description: '' });
    } catch (err) {
      notify('error', (err as Error).message);
    }
  };

  const handleAddRecipeIngredient = async (e: React.FormEvent) => {
    e.preventDefault();
    const ing = cafeState.ingredients.find((i) => i.id === newIngredientId);
    if (!ing || newQty <= 0) return;
    const existingItems = activeRecipe?.items ?? [];
    const updatedItems = [
      ...existingItems.filter((i) => i.ingredientId !== ing.id),
      { id: `ri_${Date.now()}`, recipeId: activeRecipe?.id ?? '', ingredientId: ing.id, quantity: newQty, unit: ing.recipeUnit },
    ];
    await saveRecipeForProduct({
      productId: selectedRecipeProductId,
      instructions: activeRecipe?.instructions ?? 'Standard cafe preparation.',
      yieldQty: 1,
      yieldUnit: 'serving',
      wasteFactorPercent: activeRecipe?.wasteFactorPercent ?? 2,
      items: updatedItems,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-white border border-[#E8DFD3] rounded-lg">
          <button
            onClick={() => setTab('menu')}
            className={`px-4 py-1.5 text-xs font-medium rounded-md ${
              tab === 'menu' ? 'bg-[#231914] text-white' : 'text-[#523B2F]'
            }`}
          >
            Products & Availability
          </button>
          <button
            onClick={() => setTab('recipes')}
            className={`px-4 py-1.5 text-xs font-medium rounded-md ${
              tab === 'recipes' ? 'bg-[#231914] text-white' : 'text-[#523B2F]'
            }`}
          >
            Recipes & Costing
          </button>
        </div>

        <button
          onClick={() => setShowAddProduct((v) => !v)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-[#231914] text-white rounded-lg"
        >
          <Plus className="w-3.5 h-3.5" />
          New Product
        </button>
      </div>

      {showAddProduct && (
        <form onSubmit={handleCreateProduct} className="bg-white border border-[#E8DFD3] rounded-xl p-5 grid sm:grid-cols-3 gap-4">
          <input
            required
            placeholder="Product Name *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="px-3 py-2 text-xs border border-[#D7C8B6] rounded-lg"
          />
          <input
            required
            placeholder="SKU *"
            value={form.sku}
            onChange={(e) => setForm({ ...form, sku: e.target.value })}
            className="px-3 py-2 text-xs font-mono border border-[#D7C8B6] rounded-lg"
          />
          <input
            placeholder="Barcode (Unique)"
            value={form.barcode}
            onChange={(e) => setForm({ ...form, barcode: e.target.value })}
            className="px-3 py-2 text-xs font-mono border border-[#D7C8B6] rounded-lg"
          />
          <select
            value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            className="px-3 py-2 text-xs border border-[#D7C8B6] rounded-lg bg-white"
          >
            {cafeState.categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            value={form.kdsStationId}
            onChange={(e) => setForm({ ...form, kdsStationId: e.target.value })}
            className="px-3 py-2 text-xs border border-[#D7C8B6] rounded-lg bg-white"
          >
            {cafeState.kdsStations.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <input
            type="number"
            step="0.01"
            placeholder="Base Price (₱)"
            value={form.basePrice}
            onChange={(e) => setForm({ ...form, basePrice: Number(e.target.value) })}
            className="px-3 py-2 text-xs font-mono border border-[#D7C8B6] rounded-lg"
          />
          <input
            required
            placeholder="Short menu description *"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="sm:col-span-2 px-3 py-2 text-xs border border-[#D7C8B6] rounded-lg"
          />
          <button type="submit" className="px-4 py-2 bg-[#231914] text-white text-xs font-medium rounded-lg">
            Save Product
          </button>
        </form>
      )}

      {tab === 'menu' ? (
        <div className="bg-white border border-[#E8DFD3] rounded-xl overflow-hidden">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#E8DFD3] bg-[#FAF8F5] font-semibold text-[#523B2F]">
                <th className="py-3 px-4">Product</th>
                <th className="py-3 px-4">SKU / Barcode</th>
                <th className="py-3 px-4">Station</th>
                <th className="py-3 px-4 text-right">Base Price</th>
                <th className="py-3 px-4 text-right">Recipe COGS</th>
                <th className="py-3 px-4">Availability Status</th>
                <th className="py-3 px-4 text-right">Override</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F4EFE8]">
              {cafeState.products.map((prod) => {
                const recipe = cafeState.recipes.find((r) => r.productId === prod.id);
                const cost = calculateRecipeUnitCost(recipe, cafeState.ingredients);
                const margin = prod.basePrice > 0 ? round2(((prod.basePrice - cost) / prod.basePrice) * 100) : 0;
                const station = cafeState.kdsStations.find((s) => s.id === prod.kdsStationId);
                const prepCheck = isProductPreparable(prod, cafeState.recipes, cafeState.ingredients);

                return (
                  <tr key={prod.id} className="hover:bg-[#FAF8F5]">
                    <td className="py-3 px-4 font-semibold text-[#231914]">{prod.name}</td>
                    <td className="py-3 px-4 font-mono text-[#6E5040]">
                      {prod.sku} {prod.barcode ? `· ${prod.barcode}` : ''}
                    </td>
                    <td className="py-3 px-4">{station?.name}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{formatPHP(prod.basePrice)}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {formatPHP(cost)} ({margin}%)
                    </td>
                    <td className="py-3 px-4">
                      {prod.isAvailable ? (
                        <span className="text-[#166534] font-medium">Available</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[#991B1B] font-medium">
                          <ShieldAlert className="w-3.5 h-3.5" />
                          {prod.manualUnavailable
                            ? `Disabled: ${prod.unavailableReason}`
                            : `Insufficient: ${prepCheck.missingIngredientNames.join(', ')}`}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() =>
                          overrideProductAvailability(
                            prod.id,
                            !prod.isAvailable,
                            prod.isAvailable ? 'Manual 86 by kitchen/barista' : 'Manager override restore'
                          )
                        }
                        className="px-2.5 py-1 border border-[#D7C8B6] rounded hover:bg-[#F4EFE8]"
                      >
                        {prod.isAvailable ? 'Mark 86' : 'Restore'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid lg:grid-cols-[300px_1fr] gap-6 items-start">
          <div className="bg-white border border-[#E8DFD3] rounded-xl p-3 space-y-1">
            {cafeState.products.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedRecipeProductId(p.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-medium ${
                  selectedRecipeProductId === p.id ? 'bg-[#231914] text-white' : 'text-[#523B2F] hover:bg-[#FAF8F5]'
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>

          <div className="bg-white border border-[#E8DFD3] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E8DFD3] pb-3">
              <div>
                <h3 className="font-semibold text-base text-[#231914]">
                  Recipe: {cafeState.products.find((p) => p.id === selectedRecipeProductId)?.name}
                </h3>
                <p className="text-xs text-[#6E5040]">
                  Calculated Unit Cost:{' '}
                  <span className="font-mono font-semibold text-[#231914]">
                    {formatPHP(calculateRecipeUnitCost(activeRecipe, cafeState.ingredients))}
                  </span>{' '}
                  (includes {activeRecipe?.wasteFactorPercent ?? 0}% prep waste factor)
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {(activeRecipe?.items ?? []).map((item) => {
                const ing = cafeState.ingredients.find((i) => i.id === item.ingredientId);
                return (
                  <div key={item.id} className="flex items-center justify-between p-3 border border-[#E8DFD3] rounded-lg text-xs">
                    <span className="font-medium text-[#231914]">{ing?.name}</span>
                    <span className="font-mono tabular-nums">
                      {item.quantity} {item.unit} · {formatPHP((ing?.unitCost ?? 0) * item.quantity)}
                    </span>
                  </div>
                );
              })}
            </div>

            <form onSubmit={handleAddRecipeIngredient} className="flex flex-wrap gap-2 pt-3 border-t border-[#E8DFD3]">
              <select
                value={newIngredientId}
                onChange={(e) => setNewIngredientId(e.target.value)}
                className="flex-1 min-w-[180px] px-3 py-2 text-xs border border-[#D7C8B6] rounded-lg bg-white"
              >
                {cafeState.ingredients.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.recipeUnit})
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="0.1"
                value={newQty}
                onChange={(e) => setNewQty(Number(e.target.value))}
                className="w-28 px-3 py-2 text-xs font-mono border border-[#D7C8B6] rounded-lg"
              />
              <button type="submit" className="px-4 py-2 bg-[#231914] text-white text-xs font-medium rounded-lg">
                Add / Update Ingredient
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
