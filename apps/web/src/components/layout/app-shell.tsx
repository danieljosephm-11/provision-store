import * as React from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BadgePercent,
  BarChart3,
  BookUser,
  Boxes,
  Building2,
  ClipboardList,
  CreditCard,
  FileBarChart,
  FileText,
  History,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Package,
  Receipt,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Store as StoreIcon,
  Truck,
  Undo2,
  Users,
  Wallet,
  Warehouse,
  X,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth';
import { cn, initials } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permissions?: string[];
  end?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, permissions: ['dashboard.view', 'report.view'], end: true },
      { to: '/pos', label: 'Point of Sale', icon: ShoppingCart, permissions: ['pos.sell'] },
    ],
  },
  {
    title: 'Sales',
    items: [
      { to: '/invoices', label: 'Invoices', icon: Receipt, permissions: ['invoice.read'] },
      { to: '/returns', label: 'Returns & refunds', icon: Undo2, permissions: ['return.read'] },
      { to: '/customers', label: 'Customers', icon: BookUser, permissions: ['customer.read'] },
      { to: '/crm', label: 'CRM', icon: Sparkles, permissions: ['customer.read'] },
    ],
  },
  {
    title: 'Inventory',
    items: [
      { to: '/products', label: 'Products', icon: Package, permissions: ['product.read'] },
      { to: '/inventory', label: 'Stock', icon: Warehouse, permissions: ['inventory.read'] },
      { to: '/catalog', label: 'Catalog', icon: Boxes, permissions: ['category.manage', 'brand.manage', 'unit.manage', 'tax.manage'] },
    ],
  },
  {
    title: 'Purchasing',
    items: [
      { to: '/purchases', label: 'Purchases', icon: ShoppingBag, permissions: ['purchase.read'] },
      { to: '/purchase-orders', label: 'Purchase orders', icon: ClipboardList, permissions: ['purchase.read'] },
      { to: '/purchase-returns', label: 'Purchase returns', icon: Truck, permissions: ['purchase.read'] },
      { to: '/suppliers', label: 'Suppliers', icon: Building2, permissions: ['supplier.read'] },
    ],
  },
  {
    title: 'Finance',
    items: [
      { to: '/expenses', label: 'Expenses', icon: Wallet, permissions: ['expense.read'] },
      { to: '/reports', label: 'Reports', icon: FileBarChart, permissions: ['report.view'] },
      { to: '/audit', label: 'Audit log', icon: History, permissions: ['audit.read'] },
    ],
  },
  {
    title: 'Administration',
    items: [
      { to: '/users', label: 'Employees', icon: Users, permissions: ['user.read'] },
      { to: '/roles', label: 'Roles & access', icon: ShieldCheck, permissions: ['role.read'] },
      { to: '/settings', label: 'Settings', icon: Settings, permissions: ['settings.read'] },
    ],
  },
];

export function AppShell() {
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const signOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const sections = NAV.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.permissions || can(item.permissions)),
  })).filter((section) => section.items.length > 0);

  const sidebar = (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
          <StoreIcon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-4 text-white">{user?.store.name ?? 'Provision Store'}</p>
          <p className="truncate text-[10px] uppercase tracking-wider text-slate-400">Store management</p>
        </div>
        <button
          type="button"
          className="rounded p-1 text-slate-400 hover:bg-sidebar-accent md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="scroll-thin flex-1 overflow-y-auto px-2.5 py-3">
        {sections.map((section) => (
          <div key={section.title} className="mb-4">
            <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              {section.title}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors',
                      isActive
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'text-slate-300 hover:bg-sidebar-accent hover:text-white',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <item.icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-emerald-400' : 'text-slate-400 group-hover:text-slate-200')} />
                      <span className="truncate">{item.label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2 rounded-lg bg-sidebar-accent/60 p-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-[11px] font-semibold text-emerald-300">
            {initials(user?.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-white">{user?.name}</p>
            <p className="truncate text-[10px] text-slate-400">{user?.role.name}</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 md:block">{sidebar}</aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-slate-950/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 shadow-pop">{sidebar}</aside>
        </div>
      ) : null}

      <div className="md:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur">
          <Button
            variant="ghost"
            size="iconSm"
            className="md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-4 w-4" />
          </Button>

          <div className="hidden min-w-0 items-center gap-2 text-xs text-muted-foreground sm:flex">
            <BadgePercent className="h-3.5 w-3.5 text-emerald-600" />
            <span className="truncate">GST-ready billing · {user?.store.stateCode ? `State ${user.store.stateCode}` : 'India'}</span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {can('pos.sell') ? (
              <Button size="sm" onClick={() => navigate('/pos')} className="hidden sm:inline-flex">
                <CreditCard className="h-4 w-4" /> New sale
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-full border bg-card py-1 pl-1 pr-2.5 text-left shadow-sm transition hover:bg-secondary/60">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                    {initials(user?.name)}
                  </span>
                  <span className="hidden sm:block">
                    <span className="block text-xs font-medium leading-3">{user?.name}</span>
                    <span className="block pt-0.5 text-[10px] text-muted-foreground">{user?.role.name}</span>
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <span className="block text-xs font-semibold text-foreground">{user?.name}</span>
                  <span className="block font-normal">{user?.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => navigate('/settings')}>
                  <Settings className="h-4 w-4" /> Profile & settings
                </DropdownMenuItem>
                {can('report.view') ? (
                  <DropdownMenuItem onSelect={() => navigate('/reports')}>
                    <BarChart3 className="h-4 w-4" /> Reports
                  </DropdownMenuItem>
                ) : null}
                {can('invoice.read') ? (
                  <DropdownMenuItem onSelect={() => navigate('/invoices')}>
                    <FileText className="h-4 w-4" /> Invoices
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onSelect={signOut}>
                  <LogOut className="h-4 w-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1500px] p-4 sm:p-5">
          <React.Suspense
            fallback={
              <div className="flex min-h-[50vh] items-center justify-center">
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <p className="text-xs">Loading…</p>
                </div>
              </div>
            }
          >
            <Outlet />
          </React.Suspense>
        </main>
      </div>
    </div>
  );
}
