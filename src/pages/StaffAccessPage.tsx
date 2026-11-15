import React, { useState } from 'react';
import { Shield, UserPlus } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ALL_MODULES, formatManilaTime, hasModulePermission } from '../lib/businessLogic';
import { AppModule, PermissionAction, StaffRoleKey } from '../types/cafe';
import { staffInviteSchema } from '../lib/validation';

const ACTIONS: PermissionAction[] = ['view', 'create', 'edit', 'delete', 'approve', 'export'];

export const StaffAccessPage: React.FC = () => {
  const { cafeState, currentUser, can, inviteStaffMember, togglePermissionOverride, notify } = useApp();
  const [selectedUserId, setSelectedUserId] = useState(cafeState.users[2]?.id ?? cafeState.users[0]?.id ?? '');
  const [inviteForm, setInviteForm] = useState({
    fullName: '',
    email: '',
    roleKey: 'cashier' as Exclude<StaffRoleKey, 'super_admin'>,
  });

  const selectedUser = cafeState.users.find((u) => u.id === selectedUserId);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const parsed = staffInviteSchema.parse(inviteForm);
      await inviteStaffMember(parsed.fullName, parsed.email, parsed.roleKey);
      setInviteForm({ fullName: '', email: '', roleKey: 'cashier' });
    } catch (err) {
      notify('error', (err as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-[360px_1fr] gap-6 items-start">
        <div className="space-y-4">
          {can('staff', 'create') && (
            <form onSubmit={handleInvite} className="bg-white border border-[#E8DFD3] rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#231914]">
                <UserPlus className="w-4 h-4" />
                Invite Staff Member
              </div>
              <p className="text-xs text-[#6E5040]">
                Public staff registration is disabled. Accounts are issued by invitation only.
              </p>
              <input
                required
                placeholder="Full Name"
                value={inviteForm.fullName}
                onChange={(e) => setInviteForm({ ...inviteForm, fullName: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-[#D7C8B6] rounded-lg"
              />
              <input
                required
                type="email"
                placeholder="Work Email"
                value={inviteForm.email}
                onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-[#D7C8B6] rounded-lg"
              />
              <select
                value={inviteForm.roleKey}
                onChange={(e) =>
                  setInviteForm({ ...inviteForm, roleKey: e.target.value as Exclude<StaffRoleKey, 'super_admin'> })
                }
                className="w-full px-3 py-2 text-xs border border-[#D7C8B6] rounded-lg bg-white"
              >
                <option value="manager">Manager</option>
                <option value="cashier">Cashier</option>
                <option value="barista">Barista / Kitchen Staff</option>
                <option value="rider">Delivery Rider</option>
              </select>
              <button type="submit" className="w-full py-2 bg-[#231914] text-white text-xs font-medium rounded-lg">
                Send Invitation
              </button>
            </form>
          )}

          <div className="bg-white border border-[#E8DFD3] rounded-xl p-4 space-y-2">
            <div className="text-xs font-semibold text-[#231914] pb-1">Staff Accounts</div>
            {cafeState.users.map((u) => (
              <button
                key={u.id}
                onClick={() => setSelectedUserId(u.id)}
                className={`w-full text-left p-3 rounded-lg border text-xs transition-colors ${
                  selectedUserId === u.id
                    ? 'bg-[#231914] text-white border-[#231914]'
                    : 'bg-white border-[#E8DFD3] hover:bg-[#FAF8F5]'
                }`}
              >
                <div className="font-semibold">{u.fullName}</div>
                <div className="opacity-80 mt-0.5 capitalize">
                  {u.roleKey.replace('_', ' ')} · {u.email}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Hybrid Permission Matrix */}
        <div className="space-y-6">
          {selectedUser && (
            <div className="bg-white border border-[#E8DFD3] rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E8DFD3] flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-sm text-[#231914] flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Hybrid Permissions: {selectedUser.fullName}
                  </h2>
                  <p className="text-xs text-[#6E5040]">
                    Defaults come from role template ({selectedUser.roleKey.replace('_', ' ')}); overrides apply per user.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#E8DFD3] bg-[#FAF8F5] font-semibold text-[#523B2F]">
                      <th className="py-2.5 px-4">Module</th>
                      {ACTIONS.map((a) => (
                        <th key={a} className="py-2.5 px-3 text-center capitalize">
                          {a}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F4EFE8]">
                    {ALL_MODULES.map((mod: AppModule) => (
                      <tr key={mod}>
                        <td className="py-2.5 px-4 font-medium capitalize text-[#231914]">
                          {mod.replace('_', ' ')}
                        </td>
                        {ACTIONS.map((act) => {
                          const enabled = hasModulePermission(selectedUser, mod, act);
                          const disabled =
                            selectedUser.roleKey === 'super_admin' ||
                            currentUser?.roleKey !== 'super_admin' ||
                            !can('staff', 'edit');
                          return (
                            <td key={act} className="py-2.5 px-3 text-center">
                              <input
                                type="checkbox"
                                checked={enabled}
                                disabled={disabled}
                                onChange={(e) =>
                                  togglePermissionOverride(selectedUser.id, mod, act, e.target.checked)
                                }
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Audit Log */}
          <div className="bg-white border border-[#E8DFD3] rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#E8DFD3] font-semibold text-sm text-[#231914]">
              Security & Operational Audit Log
            </div>
            <div className="divide-y divide-[#F4EFE8] max-h-72 overflow-y-auto text-xs">
              {cafeState.auditLogs.map((log) => (
                <div key={log.id} className="px-5 py-3 flex items-start justify-between gap-4">
                  <div>
                    <div className="font-semibold text-[#231914]">
                      {log.action.replace(/_/g, ' ')} · <span className="capitalize">{log.module}</span>
                    </div>
                    <div className="text-[#6E5040]">
                      Actor: {log.actorName} {log.reason ? `· Reason: ${log.reason}` : ''}
                    </div>
                  </div>
                  <div className="font-mono text-[11px] text-[#8B6956] shrink-0">
                    {formatManilaTime(log.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
