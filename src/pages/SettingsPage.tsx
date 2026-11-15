import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { ChannelApprovalPolicy } from '../types/cafe';

export const SettingsPage: React.FC = () => {
  const { cafeState, updateBusinessSettings, updateTaxProfile, updateChannelPolicy } = useApp();
  const [bizName, setBizName] = useState(cafeState.business.businessName);
  const [tin, setTin] = useState(cafeState.business.tin ?? '');
  const [footer, setFooter] = useState(cafeState.business.receiptFooter);

  const defaultTax = cafeState.taxProfiles.find((t) => t.isDefault) ?? cafeState.taxProfiles[0];
  const [taxRate, setTaxRate] = useState(defaultTax.ratePercent);
  const [taxType, setTaxType] = useState(defaultTax.taxType);
  const [pricingMode, setPricingMode] = useState(defaultTax.pricingMode);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="bg-white border border-[#E8DFD3] rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-[#E8DFD3] pb-3">
          <div>
            <h2 className="font-semibold text-base text-[#231914]">Business & Receipt Configuration</h2>
            <p className="text-xs text-[#6E5040]">Currency: PHP (₱) · Timezone: Asia/Manila</p>
          </div>
          <Link
            to="/setup"
            className="px-3.5 py-2 text-xs font-medium border border-[#D7C8B6] rounded-lg hover:bg-[#F4EFE8]"
          >
            Open 14-Step Setup Wizard
          </Link>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-medium text-[#523B2F] mb-1">Business Name</label>
            <input
              value={bizName}
              onChange={(e) => setBizName(e.target.value)}
              className="w-full px-3 py-2 border border-[#D7C8B6] rounded-lg"
            />
          </div>
          <div>
            <label className="block font-medium text-[#523B2F] mb-1">BIR TIN</label>
            <input
              value={tin}
              onChange={(e) => setTin(e.target.value)}
              className="w-full px-3 py-2 font-mono border border-[#D7C8B6] rounded-lg"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block font-medium text-[#523B2F] mb-1">Receipt Thank-You Footer</label>
            <input
              value={footer}
              onChange={(e) => setFooter(e.target.value)}
              className="w-full px-3 py-2 border border-[#D7C8B6] rounded-lg"
            />
          </div>
        </div>
        <button
          onClick={() => updateBusinessSettings({ businessName: bizName, tin, receiptFooter: footer })}
          className="px-4 py-2 bg-[#231914] text-white text-xs font-medium rounded-lg"
        >
          Save Business Profile
        </button>
      </div>

      {/* Configurable Tax Settings */}
      <div className="bg-white border border-[#E8DFD3] rounded-xl p-6 space-y-4">
        <h3 className="font-semibold text-base text-[#231914] border-b border-[#E8DFD3] pb-3">
          Tax Configuration (Configurable VAT / Non-VAT)
        </h3>
        <div className="grid sm:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block font-medium text-[#523B2F] mb-1">Tax Registration</label>
            <select
              value={taxType}
              onChange={(e) => setTaxType(e.target.value as 'vat' | 'non_vat')}
              className="w-full px-3 py-2 border border-[#D7C8B6] rounded-lg bg-white"
            >
              <option value="vat">VAT Registered</option>
              <option value="non_vat">Non-VAT</option>
            </select>
          </div>
          <div>
            <label className="block font-medium text-[#523B2F] mb-1">Pricing Mode</label>
            <select
              value={pricingMode}
              onChange={(e) => setPricingMode(e.target.value as 'inclusive' | 'exclusive')}
              className="w-full px-3 py-2 border border-[#D7C8B6] rounded-lg bg-white"
            >
              <option value="inclusive">Tax-Inclusive</option>
              <option value="exclusive">Tax-Exclusive</option>
            </select>
          </div>
          <div>
            <label className="block font-medium text-[#523B2F] mb-1">Tax Rate (%)</label>
            <input
              type="number"
              step="0.01"
              value={taxRate}
              onChange={(e) => setTaxRate(Number(e.target.value))}
              className="w-full px-3 py-2 font-mono border border-[#D7C8B6] rounded-lg"
            />
          </div>
        </div>
        <button
          onClick={() =>
            updateTaxProfile({
              ...defaultTax,
              taxType,
              pricingMode,
              ratePercent: taxType === 'non_vat' ? 0 : taxRate,
              isExempt: taxType === 'non_vat',
              name:
                taxType === 'non_vat'
                  ? 'Non-VAT Exempt'
                  : `${taxRate}% VAT (${pricingMode === 'inclusive' ? 'Inclusive' : 'Exclusive'})`,
              isDefault: true,
            })
          }
          className="px-4 py-2 bg-[#231914] text-white text-xs font-medium rounded-lg"
        >
          Apply Tax Settings
        </button>
      </div>

      {/* Customer Channel Approval Policies */}
      <div className="bg-white border border-[#E8DFD3] rounded-xl p-6 space-y-4">
        <h3 className="font-semibold text-base text-[#231914] border-b border-[#E8DFD3] pb-3">
          Self-Ordering Channel Approval Policies
        </h3>
        <div className="space-y-3">
          {cafeState.channelPolicies
            .filter((c) => c.channel !== 'pos')
            .map((pol) => (
              <div key={pol.id} className="flex flex-wrap items-center justify-between gap-3 p-3 border border-[#E8DFD3] rounded-lg text-xs">
                <span className="font-semibold uppercase text-[#231914]">{pol.channel.replace('_', ' ')}</span>
                <select
                  value={pol.approvalPolicy}
                  onChange={(e) =>
                    updateChannelPolicy({
                      ...pol,
                      approvalPolicy: e.target.value as ChannelApprovalPolicy,
                    })
                  }
                  className="px-3 py-1.5 border border-[#D7C8B6] rounded-lg bg-white"
                >
                  <option value="auto_confirm">Automatic Confirmation</option>
                  <option value="staff_approval">Require Staff Approval</option>
                  <option value="auto_with_exception">Auto-Confirm with Exception Review</option>
                </select>
              </div>
            ))}
        </div>
      </div>

      {/* Printer Configuration */}
      <div className="bg-white border border-[#E8DFD3] rounded-xl p-6 space-y-3">
        <h3 className="font-semibold text-base text-[#231914]">Printers & Paper Configuration</h3>
        <p className="text-xs text-[#6E5040]">
          Browser printing supports 58mm, 80mm, A4, and Letter with user confirmation. Silent automatic thermal printing requires running a compatible local print-bridge service on the cafe terminal.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          {cafeState.printers.map((p) => (
            <div key={p.id} className="p-3 border border-[#E8DFD3] rounded-lg text-xs flex justify-between">
              <span className="font-semibold">{p.name}</span>
              <span className="font-mono text-[#6E5040]">{p.target} · {p.paperSize}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
