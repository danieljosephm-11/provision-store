import * as React from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { Compass, Loader2 } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { ForbiddenPage, ProtectedRoute, RequirePermission } from '@/components/layout/route-guards';
import { Button } from '@/components/ui/button';
import { LoginPage } from '@/pages/login-page';

const DashboardPage = React.lazy(() =>
  import('@/pages/dashboard-page').then((module) => ({ default: module.DashboardPage })),
);
const PosPage = React.lazy(() => import('@/pages/pos-page').then((module) => ({ default: module.PosPage })));
const InvoicesPage = React.lazy(() =>
  import('@/pages/invoices-page').then((module) => ({ default: module.InvoicesPage })),
);
const InvoiceDetailPage = React.lazy(() =>
  import('@/pages/invoice-detail-page').then((module) => ({ default: module.InvoiceDetailPage })),
);
const ReturnsPage = React.lazy(() =>
  import('@/pages/returns-page').then((module) => ({ default: module.ReturnsPage })),
);
const CustomersPage = React.lazy(() =>
  import('@/pages/customers-page').then((module) => ({ default: module.CustomersPage })),
);
const CustomerDetailPage = React.lazy(() =>
  import('@/pages/customer-detail-page').then((module) => ({ default: module.CustomerDetailPage })),
);
const CrmPage = React.lazy(() => import('@/pages/crm-page').then((module) => ({ default: module.CrmPage })));
const ProductsPage = React.lazy(() =>
  import('@/pages/products-page').then((module) => ({ default: module.ProductsPage })),
);
const InventoryPage = React.lazy(() =>
  import('@/pages/inventory-page').then((module) => ({ default: module.InventoryPage })),
);
const CatalogPage = React.lazy(() =>
  import('@/pages/catalog-page').then((module) => ({ default: module.CatalogPage })),
);
const PurchasesPage = React.lazy(() =>
  import('@/pages/purchases-page').then((module) => ({ default: module.PurchasesPage })),
);
const PurchaseNewPage = React.lazy(() =>
  import('@/pages/purchase-new-page').then((module) => ({ default: module.PurchaseNewPage })),
);
const PurchaseDetailPage = React.lazy(() =>
  import('@/pages/purchase-detail-page').then((module) => ({ default: module.PurchaseDetailPage })),
);
const PurchaseOrdersPage = React.lazy(() =>
  import('@/pages/purchase-orders-page').then((module) => ({ default: module.PurchaseOrdersPage })),
);
const PurchaseReturnsPage = React.lazy(() =>
  import('@/pages/purchase-returns-page').then((module) => ({ default: module.PurchaseReturnsPage })),
);
const SuppliersPage = React.lazy(() =>
  import('@/pages/suppliers-page').then((module) => ({ default: module.SuppliersPage })),
);
const SupplierDetailPage = React.lazy(() =>
  import('@/pages/supplier-detail-page').then((module) => ({ default: module.SupplierDetailPage })),
);
const ExpensesPage = React.lazy(() =>
  import('@/pages/expenses-page').then((module) => ({ default: module.ExpensesPage })),
);
const ReportsPage = React.lazy(() =>
  import('@/pages/reports-page').then((module) => ({ default: module.ReportsPage })),
);
const AuditPage = React.lazy(() => import('@/pages/audit-page').then((module) => ({ default: module.AuditPage })));
const UsersPage = React.lazy(() => import('@/pages/users-page').then((module) => ({ default: module.UsersPage })));
const RolesPage = React.lazy(() => import('@/pages/roles-page').then((module) => ({ default: module.RolesPage })));
const SettingsPage = React.lazy(() =>
  import('@/pages/settings-page').then((module) => ({ default: module.SettingsPage })),
);

function PageFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="flex flex-col items-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <p className="text-xs">Loading…</p>
      </div>
    </div>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  React.useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [pathname]);
  return null;
}

function NotFoundPage() {
  return (
    <div className="card-surface flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <Compass className="h-6 w-6" />
      </span>
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">404</p>
      <h2 className="text-lg font-semibold">This page does not exist</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        The page may have moved, or the address was typed incorrectly. Use the menu to get back to your work.
      </p>
      <div className="mt-1 flex gap-2">
        <Button asChild variant="outline">
          <Link to="/">Back to dashboard</Link>
        </Button>
        <Button asChild>
          <Link to="/pos">Open POS</Link>
        </Button>
      </div>
    </div>
  );
}

export function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route
              index
              element={
                <RequirePermission permission={['dashboard.view', 'report.view']}>
                  <DashboardPage />
                </RequirePermission>
              }
            />
            <Route
              path="pos"
              element={
                <RequirePermission permission="pos.sell">
                  <PosPage />
                </RequirePermission>
              }
            />
            <Route
              path="invoices"
              element={
                <RequirePermission permission="invoice.read">
                  <InvoicesPage />
                </RequirePermission>
              }
            />
            <Route
              path="invoices/:id"
              element={
                <RequirePermission permission="invoice.read">
                  <InvoiceDetailPage />
                </RequirePermission>
              }
            />
            <Route
              path="returns"
              element={
                <RequirePermission permission="return.read">
                  <ReturnsPage />
                </RequirePermission>
              }
            />
            <Route
              path="customers"
              element={
                <RequirePermission permission="customer.read">
                  <CustomersPage />
                </RequirePermission>
              }
            />
            <Route
              path="customers/:id"
              element={
                <RequirePermission permission="customer.read">
                  <CustomerDetailPage />
                </RequirePermission>
              }
            />
            <Route
              path="crm"
              element={
                <RequirePermission permission="customer.read">
                  <CrmPage />
                </RequirePermission>
              }
            />
            <Route
              path="products"
              element={
                <RequirePermission permission="product.read">
                  <ProductsPage />
                </RequirePermission>
              }
            />
            <Route
              path="inventory"
              element={
                <RequirePermission permission="inventory.read">
                  <InventoryPage />
                </RequirePermission>
              }
            />
            <Route
              path="catalog"
              element={
                <RequirePermission permission={['category.manage', 'brand.manage', 'unit.manage', 'tax.manage']}>
                  <CatalogPage />
                </RequirePermission>
              }
            />
            <Route
              path="purchases"
              element={
                <RequirePermission permission="purchase.read">
                  <PurchasesPage />
                </RequirePermission>
              }
            />
            <Route
              path="purchases/new"
              element={
                <RequirePermission permission="purchase.create">
                  <PurchaseNewPage />
                </RequirePermission>
              }
            />
            <Route
              path="purchases/:id"
              element={
                <RequirePermission permission="purchase.read">
                  <PurchaseDetailPage />
                </RequirePermission>
              }
            />
            <Route
              path="purchase-orders"
              element={
                <RequirePermission permission="purchase.read">
                  <PurchaseOrdersPage />
                </RequirePermission>
              }
            />
            <Route
              path="purchase-returns"
              element={
                <RequirePermission permission="purchase.read">
                  <PurchaseReturnsPage />
                </RequirePermission>
              }
            />
            <Route
              path="suppliers"
              element={
                <RequirePermission permission="supplier.read">
                  <SuppliersPage />
                </RequirePermission>
              }
            />
            <Route
              path="suppliers/:id"
              element={
                <RequirePermission permission="supplier.read">
                  <SupplierDetailPage />
                </RequirePermission>
              }
            />
            <Route
              path="expenses"
              element={
                <RequirePermission permission="expense.read">
                  <ExpensesPage />
                </RequirePermission>
              }
            />
            <Route
              path="reports"
              element={
                <RequirePermission permission="report.view">
                  <ReportsPage />
                </RequirePermission>
              }
            />
            <Route
              path="audit"
              element={
                <RequirePermission permission="audit.read">
                  <AuditPage />
                </RequirePermission>
              }
            />
            <Route
              path="users"
              element={
                <RequirePermission permission="user.read">
                  <UsersPage />
                </RequirePermission>
              }
            />
            <Route
              path="roles"
              element={
                <RequirePermission permission="role.read">
                  <RolesPage />
                </RequirePermission>
              }
            />
            <Route
              path="settings"
              element={
                <RequirePermission permission="settings.read">
                  <SettingsPage />
                </RequirePermission>
              }
            />
            <Route path="forbidden" element={<ForbiddenPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </>
  );
}
