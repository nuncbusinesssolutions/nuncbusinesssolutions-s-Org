import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, ShieldCheck, Upload } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { parseCsvText } from '../lib/businessLogic';
import { businessInfoSchema, taxProfileSchema } from '../lib/validation';
import { getSupabaseClient } from '../services/supabaseClient';

const STEPS = [
  '1. Business Info',
  '2. Branch Info',
  '3. Currency & Timezone',
  '4. Tax Configuration',
  '5. Business Hours',
  '6. Menu Categories',
  '7. Products & Variants',
  '8. Ingredients',
  '9. Recipes',
  '10. Tables & Zones',
  '11. Staff Invitations',
  '12. Opening Inventory',
  '13. Printer Config',
  '14. Final Review',
];

export const OnboardingWizardPage: React.FC = () => {
  const {
    envMode,
    currentUser,
    supabaseReady,
    cafeState,
    setupInitialOwnerProduction,
    updateBusinessSettings,
    updateTaxProfile,
    createProduct,
    createIngredient,
    inviteStaffMember,
    notify,
  } = useApp();
  const navigate = useNavigate();

  const [ownerExists, setOwnerExists] = useState<boolean | null>(null);
  const [ownerForm, setOwnerForm] = useState({
    fullName: '',
    email: '',
    password: '',
    businessName: '',
    branchName: 'Main Branch',
    address: '',
    phone: '',
  });
  const [provisioningOwner, setProvisioningOwner] = useState(false);

  useEffect(() => {
    if (envMode !== 'production' || !supabaseReady) {
      setOwnerExists(null);
      return;
    }
    const sb = getSupabaseClient();
    if (!sb) return;
    sb.rpc('is_owner_exists', { p_env: 'production' }).then(({ data }) => {
      setOwnerExists(Boolean(data));
    });
  }, [envMode, supabaseReady]);

  const [step, setStep] = useState<number>(1);
  const [bizForm, setBizForm] = useState({
    businessName: cafeState.business.businessName,
    address: cafeState.business.address,
    phone: cafeState.business.phone,
    email: cafeState.business.email,
    tin: cafeState.business.tin ?? '',
    receiptFooter: cafeState.business.receiptFooter,
  });

  const defaultTax = cafeState.taxProfiles.find((t) => t.isDefault) ?? cafeState.taxProfiles[0];
  const [taxForm, setTaxForm] = useState({
    name: defaultTax.name,
    taxType: defaultTax.taxType,
    pricingMode: defaultTax.pricingMode,
    ratePercent: defaultTax.ratePercent,
    isExempt: defaultTax.isExempt,
  });

  const [csvPreview, setCsvPreview] = useState<Array<Record<string, string>>>([]);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [inviteForm, setInviteForm] = useState({ fullName: '', email: '', roleKey: 'cashier' as const });

  const handleOwnerBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setProvisioningOwner(true);
    try {
      await setupInitialOwnerProduction(ownerForm);
      setOwnerExists(true);
    } catch (err) {
      notify('error', (err as Error).message);
    } finally {
      setProvisioningOwner(false);
    }
  };

  if (envMode === 'production' && !currentUser) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center p-6">
        <div className="bg-white border border-[#E8DFD3] rounded-xl max-w-lg w-full p-6 space-y-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-[#231914] shrink-0 mt-0.5" />
            <div>
              <h1 className="font-['Fraunces'] text-2xl font-semibold text-[#231914]">
                Production Owner Bootstrap
              </h1>
              <p className="text-xs text-[#6E5040] mt-1">
                One-time initialization creates the sole Production Super Admin and primary branch. Once created, public registration is permanently locked.
              </p>
            </div>
          </div>

          {!supabaseReady ? (
            <div className="p-4 bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg text-xs text-[#523B2F]">
              Configure Supabase credentials in environment variables to initialize Production.
            </div>
          ) : ownerExists ? (
            <div className="space-y-3">
              <div className="p-4 bg-[#FEF2F2] border border-[#FECACA] rounded-lg text-xs text-[#991B1B]">
                An active Production Super Admin already exists. Sign in with an invited staff account to access setup settings.
              </div>
              <button
                onClick={() => navigate('/login')}
                className="w-full py-2.5 bg-[#231914] text-white text-xs font-medium rounded-lg"
              >
                Go to Staff Login
              </button>
            </div>
          ) : (
            <form onSubmit={handleOwnerBootstrap} className="space-y-3 text-xs">
              <input
                required
                placeholder="Owner Full Name *"
                value={ownerForm.fullName}
                onChange={(e) => setOwnerForm({ ...ownerForm, fullName: e.target.value })}
                className="w-full px-3 py-2 border border-[#D7C8B6] rounded-lg"
              />
              <input
                required
                type="email"
                placeholder="Owner Email *"
                value={ownerForm.email}
                onChange={(e) => setOwnerForm({ ...ownerForm, email: e.target.value })}
                className="w-full px-3 py-2 border border-[#D7C8B6] rounded-lg"
              />
              <input
                required
                type="password"
                minLength={8}
                placeholder="Password (min 8 chars) *"
                value={ownerForm.password}
                onChange={(e) => setOwnerForm({ ...ownerForm, password: e.target.value })}
                className="w-full px-3 py-2 border border-[#D7C8B6] rounded-lg"
              />
              <input
                required
                placeholder="Cafe Business Name *"
                value={ownerForm.businessName}
                onChange={(e) => setOwnerForm({ ...ownerForm, businessName: e.target.value })}
                className="w-full px-3 py-2 border border-[#D7C8B6] rounded-lg"
              />
              <div className="grid sm:grid-cols-2 gap-3">
                <input
                  placeholder="Primary Branch Name"
                  value={ownerForm.branchName}
                  onChange={(e) => setOwnerForm({ ...ownerForm, branchName: e.target.value })}
                  className="w-full px-3 py-2 border border-[#D7C8B6] rounded-lg"
                />
                <input
                  placeholder="Contact Phone"
                  value={ownerForm.phone}
                  onChange={(e) => setOwnerForm({ ...ownerForm, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-[#D7C8B6] rounded-lg"
                />
              </div>
              <input
                placeholder="Registered Cafe Address"
                value={ownerForm.address}
                onChange={(e) => setOwnerForm({ ...ownerForm, address: e.target.value })}
                className="w-full px-3 py-2 border border-[#D7C8B6] rounded-lg"
              />
              <button
                type="submit"
                disabled={provisioningOwner}
                className="w-full py-2.5 bg-[#231914] text-white font-medium rounded-lg disabled:opacity-60"
              >
                {provisioningOwner ? 'Provisioning Owner & Branch...' : 'Create Owner & Launch 14-Step Setup'}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>, expectedCols: string[]) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const { headers, rows } = parseCsvText(text);
      const missing = expectedCols.filter((c) => !headers.includes(c));
      if (missing.length > 0) {
        setCsvErrors([`Missing required CSV columns: ${missing.join(', ')}`]);
        setCsvPreview([]);
        return;
      }
      setCsvErrors([]);
      setCsvPreview(rows);
    };
    reader.readAsText(file);
  };

  const commitStepAndNext = async () => {
    try {
      if (step === 1) {
        const parsed = businessInfoSchema.parse(bizForm);
        await updateBusinessSettings(parsed);
      } else if (step === 4) {
        const parsed = taxProfileSchema.parse(taxForm);
        await updateTaxProfile({
          ...defaultTax,
          ...parsed,
          isDefault: true,
        });
      }
      if (step < 14) setStep(step + 1);
      else {
        await updateBusinessSettings({ isSetupCompleted: true, setupStep: 14 });
        notify('success', 'Cafe setup completed.');
        navigate('/app');
      }
    } catch (err) {
      notify('error', (err as Error).message);
    }
  };

  const importPreviewProducts = async () => {
    const defaultCategoryId = cafeState.categories[0]?.id;
    const defaultStationId = cafeState.kdsStations[0]?.id;
    if (!defaultCategoryId || !defaultStationId) {
      notify('error', 'Configure at least one menu category and KDS station before importing products.');
      return;
    }
    let count = 0;
    for (const row of csvPreview) {
      await createProduct({
        name: row.name,
        sku: row.sku || `SKU-${Date.now()}-${count}`,
        barcode: row.barcode || undefined,
        categoryId: defaultCategoryId,
        kdsStationId: defaultStationId,
        description: row.description || 'Imported menu item',
        basePrice: Number(row.price || 150),
        isFeatured: false,
        variants: [{ id: `var_${Date.now()}_${count}`, productId: '', name: 'Regular', priceDelta: 0, isDefault: true }],
        modifierGroupIds: [],
      });
      count++;
    }
    setCsvPreview([]);
    notify('success', `Imported ${count} validated products.`);
  };

  const importPreviewIngredients = async () => {
    let count = 0;
    for (const row of csvPreview) {
      await createIngredient({
        name: row.name,
        categoryName: row.category || 'General',
        barcode: row.barcode || undefined,
        purchaseUnit: row.purchase_unit || 'pack',
        recipeUnit: row.recipe_unit || 'g',
        conversionRatio: Number(row.conversion_ratio || 1000),
        currentStock: Number(row.opening_stock || 0),
        reorderPoint: Number(row.reorder_point || 100),
        unitCost: Number(row.unit_cost || 1),
      });
      count++;
    }
    setCsvPreview([]);
    notify('success', `Imported ${count} validated ingredients.`);
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] py-8 px-4 sm:px-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <span className="text-xs font-medium text-[#6E5040]">Guided Production & Demo Setup</span>
            <h1 className="font-['Fraunces'] text-2xl sm:text-3xl font-semibold text-[#231914]">
              First-Time Cafe Setup Wizard
            </h1>
          </div>
          <button
            onClick={() => navigate('/app')}
            className="px-4 py-2 text-xs font-medium border border-[#D7C8B6] bg-white rounded-lg hover:bg-[#F4EFE8]"
          >
            Back to Workspace
          </button>
        </div>

        <div className="grid lg:grid-cols-[260px_1fr] gap-6 items-start">
          {/* Step sidebar */}
          <div className="bg-white border border-[#E8DFD3] rounded-xl p-3 space-y-1">
            {STEPS.map((label, idx) => {
              const num = idx + 1;
              const active = step === num;
              const done = step > num;
              return (
                <button
                  key={label}
                  onClick={() => {
                    setCsvPreview([]);
                    setCsvErrors([]);
                    setStep(num);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-left transition-colors ${
                    active
                      ? 'bg-[#231914] text-white'
                      : done
                        ? 'text-[#231914] bg-[#F4EFE8]'
                        : 'text-[#6E5040] hover:bg-[#FAF8F5]'
                  }`}
                >
                  <span className="truncate">{label}</span>
                  {done && <Check className="w-3.5 h-3.5 shrink-0" />}
                </button>
              );
            })}
          </div>

          {/* Step Body */}
          <div className="bg-white border border-[#E8DFD3] rounded-xl p-6 space-y-6">
            <div className="border-b border-[#E8DFD3] pb-4">
              <h2 className="text-lg font-semibold text-[#231914]">{STEPS[step - 1]}</h2>
            </div>

            {step === 1 && (
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[#523B2F] mb-1">Cafe Business Name</label>
                  <input
                    value={bizForm.businessName}
                    onChange={(e) => setBizForm({ ...bizForm, businessName: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-[#D7C8B6] rounded-lg"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[#523B2F] mb-1">Registered Address</label>
                  <input
                    value={bizForm.address}
                    onChange={(e) => setBizForm({ ...bizForm, address: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-[#D7C8B6] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#523B2F] mb-1">Contact Phone</label>
                  <input
                    value={bizForm.phone}
                    onChange={(e) => setBizForm({ ...bizForm, phone: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-[#D7C8B6] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#523B2F] mb-1">Business Email</label>
                  <input
                    value={bizForm.email}
                    onChange={(e) => setBizForm({ ...bizForm, email: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-[#D7C8B6] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#523B2F] mb-1">BIR TIN (Optional)</label>
                  <input
                    value={bizForm.tin}
                    onChange={(e) => setBizForm({ ...bizForm, tin: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-[#D7C8B6] rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#523B2F] mb-1">Receipt Footer</label>
                  <input
                    value={bizForm.receiptFooter}
                    onChange={(e) => setBizForm({ ...bizForm, receiptFooter: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-[#D7C8B6] rounded-lg"
                  />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3 text-sm text-[#523B2F]">
                <p>Primary Branch: <strong className="text-[#231914]">{cafeState.branch.name}</strong> ({cafeState.branch.code})</p>
                <p>Order Number Prefix: <span className="font-mono bg-[#F4EFE8] px-2 py-0.5 rounded">{cafeState.branch.orderPrefix}</span></p>
                <p className="text-xs text-[#6E5040]">
                  All database tables carry <code className="font-mono">branch_id</code> so additional branches can be activated without schema rewrites.
                </p>
              </div>
            )}

            {step === 3 && (
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <div className="p-4 border border-[#E8DFD3] rounded-lg bg-[#FAF8F5]">
                  <div className="text-xs text-[#6E5040]">Currency</div>
                  <div className="font-semibold text-[#231914] mt-1">Philippine Peso (PHP · ₱)</div>
                </div>
                <div className="p-4 border border-[#E8DFD3] rounded-lg bg-[#FAF8F5]">
                  <div className="text-xs text-[#6E5040]">Timezone</div>
                  <div className="font-semibold text-[#231914] mt-1">Asia/Manila (UTC+08:00)</div>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[#523B2F] mb-1">Tax Profile Name</label>
                  <input
                    value={taxForm.name}
                    onChange={(e) => setTaxForm({ ...taxForm, name: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-[#D7C8B6] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#523B2F] mb-1">Registration Type</label>
                  <select
                    value={taxForm.taxType}
                    onChange={(e) => setTaxForm({ ...taxForm, taxType: e.target.value as 'vat' | 'non_vat' })}
                    className="w-full px-3 py-2 text-sm border border-[#D7C8B6] rounded-lg bg-white"
                  >
                    <option value="vat">VAT Registered</option>
                    <option value="non_vat">Non-VAT Registered</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#523B2F] mb-1">Menu Pricing Mode</label>
                  <select
                    value={taxForm.pricingMode}
                    onChange={(e) => setTaxForm({ ...taxForm, pricingMode: e.target.value as 'inclusive' | 'exclusive' })}
                    className="w-full px-3 py-2 text-sm border border-[#D7C8B6] rounded-lg bg-white"
                  >
                    <option value="inclusive">Tax-Inclusive Prices</option>
                    <option value="exclusive">Tax-Exclusive (Added at Checkout)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#523B2F] mb-1">Configured Tax Rate (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={taxForm.ratePercent}
                    onChange={(e) => setTaxForm({ ...taxForm, ratePercent: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm border border-[#D7C8B6] rounded-lg font-mono tabular-nums"
                  />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <input
                    id="tax-exempt"
                    type="checkbox"
                    checked={taxForm.isExempt}
                    onChange={(e) => setTaxForm({ ...taxForm, isExempt: e.target.checked })}
                  />
                  <label htmlFor="tax-exempt" className="text-xs font-medium text-[#231914]">
                    Mark default profile as Tax Exempt
                  </label>
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="space-y-2">
                {cafeState.branchHours.map((h) => (
                  <div key={h.id} className="flex items-center justify-between py-2 border-b border-[#F4EFE8] text-xs">
                    <span className="font-medium w-28">
                      {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][h.dayOfWeek]}
                    </span>
                    <span className="font-mono">{h.isClosed ? 'Closed' : `${h.openTime} – ${h.closeTime}`}</span>
                  </div>
                ))}
              </div>
            )}

            {step === 6 && (
              <div className="space-y-2">
                <p className="text-xs text-[#6E5040]">Active menu categories ({cafeState.categories.length}):</p>
                <div className="grid sm:grid-cols-2 gap-2">
                  {cafeState.categories.map((c) => (
                    <div key={c.id} className="px-3 py-2 border border-[#E8DFD3] rounded-lg text-sm font-medium">
                      {c.name}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(step === 7 || step === 8) && (
              <div className="space-y-4">
                <div className="p-4 border border-dashed border-[#D7C8B6] rounded-xl bg-[#FAF8F5] space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-[#231914]">
                        Validated CSV Import ({step === 7 ? 'Products' : 'Ingredients'})
                      </div>
                      <div className="text-xs text-[#6E5040] mt-0.5">
                        {step === 7
                          ? 'Required columns: name, sku, price (optional: barcode, description)'
                          : 'Required columns: name, purchase_unit, recipe_unit, conversion_ratio, opening_stock, unit_cost'}
                      </div>
                    </div>
                    <label className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-[#D7C8B6] rounded-lg text-xs font-medium cursor-pointer hover:bg-[#F4EFE8]">
                      <Upload className="w-3.5 h-3.5" />
                      Choose CSV
                      <input
                        type="file"
                        accept=".csv"
                        className="hidden"
                        onChange={(e) =>
                          handleCsvUpload(
                            e,
                            step === 7
                              ? ['name', 'sku', 'price']
                              : ['name', 'purchase_unit', 'recipe_unit', 'conversion_ratio', 'opening_stock', 'unit_cost']
                          )
                        }
                      />
                    </label>
                  </div>
                  {csvErrors.length > 0 && (
                    <div className="text-xs text-[#991B1B] bg-[#FEF2F2] border border-[#FECACA] rounded p-2">
                      {csvErrors.join('; ')}
                    </div>
                  )}
                  {csvPreview.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-[#166534]">
                        Preview ready: {csvPreview.length} row(s) validated.
                      </div>
                      <button
                        onClick={step === 7 ? importPreviewProducts : importPreviewIngredients}
                        className="px-4 py-2 bg-[#231914] text-white text-xs font-medium rounded-lg"
                      >
                        Confirm & Insert {csvPreview.length} Record(s)
                      </button>
                    </div>
                  )}
                </div>
                <div className="text-xs text-[#6E5040]">
                  Currently configured: {step === 7 ? `${cafeState.products.length} products` : `${cafeState.ingredients.length} ingredients`}. Manage full details in Menu & Inventory modules.
                </div>
              </div>
            )}

            {step === 9 && (
              <div className="text-sm text-[#523B2F] space-y-2">
                <p>Configured Recipes: <strong>{cafeState.recipes.length}</strong> product recipes linked to live ingredient deduction.</p>
                <p className="text-xs text-[#6E5040]">Edit ingredient quantities, waste factors, and purchase-to-recipe conversions anytime in Menu & Recipes.</p>
              </div>
            )}

            {step === 10 && (
              <div className="text-sm text-[#523B2F] space-y-2">
                <p>Dining Zones: <strong>{cafeState.zones.length}</strong> · Tables: <strong>{cafeState.tables.length}</strong></p>
                <p className="text-xs text-[#6E5040]">Each table has an assigned unique QR token for contactless ordering and shared table carts.</p>
              </div>
            )}

            {step === 11 && (
              <div className="space-y-4">
                <p className="text-xs text-[#6E5040]">Staff accounts are invitation-only. Invite your opening team:</p>
                <div className="grid sm:grid-cols-3 gap-3">
                  <input
                    placeholder="Full name"
                    value={inviteForm.fullName}
                    onChange={(e) => setInviteForm({ ...inviteForm, fullName: e.target.value })}
                    className="px-3 py-2 text-sm border border-[#D7C8B6] rounded-lg"
                  />
                  <input
                    placeholder="Email address"
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                    className="px-3 py-2 text-sm border border-[#D7C8B6] rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (!inviteForm.fullName || !inviteForm.email) return;
                      await inviteStaffMember(inviteForm.fullName, inviteForm.email, inviteForm.roleKey);
                      setInviteForm({ fullName: '', email: '', roleKey: 'cashier' });
                    }}
                    className="px-4 py-2 bg-[#231914] text-white text-xs font-medium rounded-lg"
                  >
                    Send Staff Invite
                  </button>
                </div>
              </div>
            )}

            {step === 12 && (
              <div className="text-sm text-[#523B2F]">
                Opening stock is tracked across <strong>{cafeState.ingredients.length}</strong> active ingredients with automatic low-stock threshold monitoring.
              </div>
            )}

            {step === 13 && (
              <div className="space-y-2">
                {cafeState.printers.map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-3 border border-[#E8DFD3] rounded-lg text-xs">
                    <span className="font-semibold text-[#231914]">{p.name}</span>
                    <span className="font-mono text-[#6E5040]">{p.target.toUpperCase()} · {p.paperSize}</span>
                  </div>
                ))}
              </div>
            )}

            {step === 14 && (
              <div className="space-y-3 text-sm text-[#523B2F]">
                <div className="p-4 bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg space-y-1.5">
                  <div><strong className="text-[#231914]">Business:</strong> {bizForm.businessName}</div>
                  <div><strong className="text-[#231914]">Default Tax:</strong> {taxForm.name} ({taxForm.ratePercent}% · {taxForm.pricingMode})</div>
                  <div><strong className="text-[#231914]">Menu & Stock:</strong> {cafeState.products.length} products, {cafeState.ingredients.length} ingredients, {cafeState.tables.length} tables</div>
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-[#E8DFD3] flex items-center justify-between">
              <button
                onClick={() => setStep((s) => Math.max(1, s - 1))}
                disabled={step === 1}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium border border-[#D7C8B6] rounded-lg disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
              <button
                onClick={commitStepAndNext}
                className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-medium bg-[#231914] text-white rounded-lg hover:bg-[#3A2920]"
              >
                {step === 14 ? 'Complete Setup & Launch' : 'Save & Continue'}
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
