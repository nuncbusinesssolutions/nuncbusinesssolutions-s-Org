import React, { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  ChefHat,
  ClipboardList,
  Coffee,
  CreditCard,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Menu,
  Package,
  RefreshCw,
  Settings,
  ShoppingBag,
  Truck,
  UserCheck,
  Wallet,
  WifiOff,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { AppModule, StaffRoleKey } from '../types/cafe';
import { formatManilaTime } from '../lib/businessLogic';

interface NavItem {
  to: string;
  label: string;
  module: AppModule;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/app', label: 'Dashboard', module: 'dashboard', icon: LayoutDashboard },
  { to: '/app/pos', label: 'Point of Sale', module: 'pos', icon: ShoppingBag },
  { to: '/app/orders', label: 'Orders', module: 'orders', icon: ClipboardList },
  { to: '/app/tables', label: 'Floor & Tables', module: 'tables', icon: LayoutGrid },
  { to: '/app/kds', label: 'Kitchen Display', module: 'kds', icon: ChefHat },
  { to: '/app/menu', label: 'Menu & Recipes', module: 'menu', icon: Coffee },
  { to: '/app/inventory', label: 'Inventory', module: 'inventory', icon: Package },
  { to: '/app/payments', label: 'Payments', module: 'payments', icon: CreditCard },
  { to: '/app/cash-drawer', label: 'Cash Drawer', module: 'cash_drawer', icon: Wallet },
  { to: '/app/delivery', label: 'Delivery', module: 'delivery', icon: Truck },
  { to: '/app/staff', label: 'Staff & Access', module: 'staff', icon: UserCheck },
  { to: '/app/settings', label: 'Settings & Setup', module: 'settings', icon: Settings },
];

const ROLE_LABELS: Record<StaffRoleKey, string> = {
  super_admin: 'Super Admin / Owner',
  manager: 'Manager',
  cashier: 'Cashier',
  barista: 'Barista / Kitchen',
  rider: 'Delivery Rider',
};

export const AppShell: React.FC = () => {
  const {
    envMode,
    setEnvMode,
    isOnline,
    isLoadingData,
    dataError,
    refreshProductionData,
    currentUser,
    cafeState,
    can,
    switchDemoRole,
    resetDemo,
    signOut,
    toasts,
    dismissToast,
    markNotificationRead,
  } = useApp();

  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const visibleNav = NAV_ITEMS.filter((item) => can(item.module, 'view'));
  const unreadNotifs = cafeState.notifications.filter((n) => !n.isRead);
  const activeRoute = visibleNav.find((n) => n.to === location.pathname) ?? visibleNav[0];

  return (
    <div className="min-h-screen flex bg-[#FAF8F5] text-[#231914]">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`no-print fixed lg:sticky top-0 left-0 z-40 h-screen w-64 bg-white border-r border-[#E8DFD3] flex flex-col transition-transform duration-150 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="px-5 py-4 border-b border-[#E8DFD3] flex items-center justify-between">
          <div>
            <Link to="/app" className="font-['Fraunces'] text-xl font-semibold tracking-tight text-[#231914]">
              {cafeState.business.businessName}
            </Link>
            <div className="text-xs text-[#6E5040] mt-0.5 truncate max-w-[180px]">
              {cafeState.branch.name}
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1.5 text-[#6E5040] hover:text-[#231914]"
            aria-label="Close navigation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#231914] text-white'
                    : 'text-[#523B2F] hover:bg-[#F4EFE8] hover:text-[#231914]'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-[#E8DFD3] space-y-2 bg-[#FAF8F5]">
          <div className="text-xs text-[#6E5040] px-2">Customer & Public Views</div>
          <div className="grid grid-cols-2 gap-1.5 px-1">
            <Link
              to="/queue"
              className="px-2.5 py-1.5 text-xs font-medium text-center border border-[#D7C8B6] bg-white rounded-md hover:bg-[#F4EFE8] whitespace-nowrap"
            >
              Queue Screen
            </Link>
            <Link
              to="/kiosk"
              className="px-2.5 py-1.5 text-xs font-medium text-center border border-[#D7C8B6] bg-white rounded-md hover:bg-[#F4EFE8] whitespace-nowrap"
            >
              Self Kiosk
            </Link>
          </div>
          <div className="pt-2 border-t border-[#E8DFD3] flex items-center justify-between px-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-[#231914] truncate">
                {currentUser?.fullName ?? 'Guest'}
              </div>
              <div className="text-[11px] text-[#6E5040] truncate">
                {currentUser ? ROLE_LABELS[currentUser.roleKey] : 'Not signed in'}
              </div>
            </div>
            <button
              onClick={async () => {
                await signOut();
                navigate('/login');
              }}
              className="p-2 text-[#6E5040] hover:text-[#231914] rounded-lg"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {!isOnline && (
          <div className="no-print bg-[#991B1B] text-white px-4 py-2 text-xs font-medium flex items-center justify-center gap-2">
            <WifiOff className="w-4 h-4" />
            <span>
              Internet connection lost. Transactional checkout, payments, and stock mutations are paused until online.
            </span>
          </div>
        )}

        <header className="no-print h-14 bg-white border-b border-[#E8DFD3] px-4 lg:px-6 flex items-center justify-between gap-4 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 -ml-2 text-[#523B2F] hover:text-[#231914]"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm truncate">
              <span className="text-[#6E5040] hidden sm:inline">KapeOS</span>
              <span className="text-[#A98976] hidden sm:inline">/</span>
              <h1 className="font-semibold text-[#231914] truncate">
                {activeRoute?.label ?? 'Workspace'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Environment Switcher (Demo vs Production isolation) */}
            <div className="flex items-center gap-1 p-0.5 bg-[#F4EFE8] border border-[#E8DFD3] rounded-lg">
              <button
                onClick={() => setEnvMode('demo')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  envMode === 'demo' ? 'bg-white text-[#231914] shadow-sm' : 'text-[#6E5040]'
                }`}
              >
                Demo
              </button>
              <button
                onClick={() => setEnvMode('production')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  envMode === 'production' ? 'bg-[#231914] text-white shadow-sm' : 'text-[#6E5040]'
                }`}
              >
                Production
              </button>
            </div>

            {envMode === 'demo' && (
              <>
                <select
                  aria-label="Switch demo role"
                  value={currentUser?.roleKey ?? 'super_admin'}
                  onChange={(e) => switchDemoRole(e.target.value as StaffRoleKey)}
                  className="text-xs border border-[#D7C8B6] bg-white rounded-lg px-2.5 py-1.5 text-[#231914] focus:outline-none focus:ring-2 focus:ring-[#3A2920]"
                >
                  {Object.entries(ROLE_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      Role: {label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={resetDemo}
                  className="hidden md:inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-[#D7C8B6] rounded-lg hover:bg-[#F4EFE8] whitespace-nowrap"
                  title="Reset isolated demo records"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reset Demo
                </button>
              </>
            )}

            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => setNotifOpen((o) => !o)}
                className="relative p-2 text-[#523B2F] hover:text-[#231914] hover:bg-[#F4EFE8] rounded-lg"
                aria-label="In-app notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadNotifs.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-[#B45309] text-white text-[10px] font-mono rounded-full flex items-center justify-center">
                    {unreadNotifs.length}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white border border-[#E8DFD3] rounded-xl shadow-lg z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-[#E8DFD3] flex items-center justify-between bg-[#FAF8F5]">
                    <span className="text-xs font-semibold text-[#231914]">
                      In-App Alerts ({unreadNotifs.length} unread)
                    </span>
                    <button
                      onClick={() => setNotifOpen(false)}
                      className="text-xs text-[#6E5040] hover:text-[#231914]"
                    >
                      Close
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-[#E8DFD3]">
                    {cafeState.notifications.length === 0 ? (
                      <div className="p-4 text-xs text-[#6E5040] text-center">No alerts yet.</div>
                    ) : (
                      cafeState.notifications.slice(0, 12).map((n) => (
                        <button
                          key={n.id}
                          onClick={() => markNotificationRead(n.id)}
                          className={`w-full text-left px-4 py-3 hover:bg-[#FAF8F5] transition-colors ${
                            n.isRead ? 'opacity-65' : 'bg-white'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-[#231914]">{n.title}</span>
                            {!n.isRead && <span className="text-[10px] font-medium text-[#B45309]">New</span>}
                          </div>
                          <p className="text-xs text-[#523B2F] mt-0.5">{n.message}</p>
                          <div className="text-[11px] text-[#8B6956] mt-1">{formatManilaTime(n.createdAt)}</div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 max-w-[1600px] w-full mx-auto space-y-4">
          {envMode === 'production' && dataError && (
            <div className="no-print bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] px-4 py-3 rounded-lg text-xs flex items-center justify-between gap-3">
              <span>Production sync error: {dataError}</span>
              <button
                onClick={() => void refreshProductionData()}
                className="px-3 py-1 bg-[#991B1B] text-white rounded font-medium shrink-0"
              >
                Retry Sync
              </button>
            </div>
          )}
          {envMode === 'production' && isLoadingData && !cafeState.branch.id ? (
            <div className="bg-white border border-[#E8DFD3] rounded-xl p-10 text-center text-xs text-[#6E5040]">
              Loading Production data from Supabase...
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>

      {/* Toast Stack */}
      <div className="no-print fixed bottom-4 right-4 z-50 space-y-2 max-w-sm w-full pointer-events-none px-4 sm:px-0">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start justify-between gap-3 px-4 py-3 rounded-lg border shadow-sm text-xs font-medium ${
              t.type === 'error'
                ? 'bg-[#FEF2F2] border-[#FECACA] text-[#991B1B]'
                : t.type === 'success'
                  ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#166534]'
                  : 'bg-white border-[#D7C8B6] text-[#231914]'
            }`}
          >
            <span>{t.text}</span>
            <button onClick={() => dismissToast(t.id)} className="shrink-0 opacity-70 hover:opacity-100">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
