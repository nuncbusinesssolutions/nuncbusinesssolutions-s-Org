import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppProvider, useApp } from './context/AppContext';
import { AppShell } from './components/AppShell';
import { LoginPage } from './pages/LoginPage';
import { OnboardingWizardPage } from './pages/OnboardingWizardPage';
import { DashboardPage } from './pages/DashboardPage';
import { PosPage } from './pages/PosPage';
import { OrdersPage } from './pages/OrdersPage';
import { TablesPage } from './pages/TablesPage';
import { KdsPage } from './pages/KdsPage';
import { MenuRecipesPage } from './pages/MenuRecipesPage';
import { InventoryPage } from './pages/InventoryPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { CashDrawerPage } from './pages/CashDrawerPage';
import { DeliveryPage } from './pages/DeliveryPage';
import { StaffAccessPage } from './pages/StaffAccessPage';
import { SettingsPage } from './pages/SettingsPage';
import { CustomerQrOrderPage } from './pages/CustomerQrOrderPage';
import { LiveOrderTrackingPage } from './pages/LiveOrderTrackingPage';
import { PublicQueuePage } from './pages/PublicQueuePage';
import { AppModule } from './types/cafe';

const queryClient = new QueryClient();

const RequireAccess: React.FC<{ module?: AppModule; children: React.ReactNode }> = ({
  module,
  children,
}) => {
  const { envMode, currentUser, can } = useApp();
  if (envMode === 'production' && !currentUser) {
    return <Navigate to="/login" replace />;
  }
  if (module && !can(module, 'view')) {
    return (
      <div className="bg-white border border-[#E8DFD3] rounded-xl p-8 text-center text-sm text-[#6E5040]">
        You do not have permission to access this module.
      </div>
    );
  }
  return <>{children}</>;
};

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/setup" element={<OnboardingWizardPage />} />

            {/* Customer Self-Ordering & Public Tracking Routes */}
            <Route path="/qr/:tableToken" element={<CustomerQrOrderPage mode="qr_table" />} />
            <Route path="/kiosk" element={<CustomerQrOrderPage mode="kiosk" />} />
            <Route path="/order-online" element={<CustomerQrOrderPage mode="online" />} />
            <Route path="/track/:orderToken" element={<LiveOrderTrackingPage />} />
            <Route path="/queue" element={<PublicQueuePage />} />

            {/* Protected Staff Operations Workspace */}
            <Route
              path="/app"
              element={
                <RequireAccess>
                  <AppShell />
                </RequireAccess>
              }
            >
              <Route index element={<RequireAccess module="dashboard"><DashboardPage /></RequireAccess>} />
              <Route path="pos" element={<RequireAccess module="pos"><PosPage /></RequireAccess>} />
              <Route path="orders" element={<RequireAccess module="orders"><OrdersPage /></RequireAccess>} />
              <Route path="tables" element={<RequireAccess module="tables"><TablesPage /></RequireAccess>} />
              <Route path="kds" element={<RequireAccess module="kds"><KdsPage /></RequireAccess>} />
              <Route path="menu" element={<RequireAccess module="menu"><MenuRecipesPage /></RequireAccess>} />
              <Route path="inventory" element={<RequireAccess module="inventory"><InventoryPage /></RequireAccess>} />
              <Route path="payments" element={<RequireAccess module="payments"><PaymentsPage /></RequireAccess>} />
              <Route path="cash-drawer" element={<RequireAccess module="cash_drawer"><CashDrawerPage /></RequireAccess>} />
              <Route path="delivery" element={<RequireAccess module="delivery"><DeliveryPage /></RequireAccess>} />
              <Route path="staff" element={<RequireAccess module="staff"><StaffAccessPage /></RequireAccess>} />
              <Route path="settings" element={<RequireAccess module="settings"><SettingsPage /></RequireAccess>} />
            </Route>

            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </AppProvider>
    </QueryClientProvider>
  );
}
