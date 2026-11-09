import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/contexts/auth';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm">Loading your store…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <Outlet />;
}

export function RequirePermission({ permission, children }: { permission: string | string[]; children: React.ReactNode }) {
  const { can } = useAuth();
  if (!can(permission)) return <ForbiddenPage />;
  return <>{children}</>;
}

export function ForbiddenPage() {
  return (
    <div className="card-surface flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
        <ShieldAlert className="h-6 w-6" />
      </span>
      <h2 className="text-lg font-semibold">You do not have access to this page</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        Your role does not include the permission required for this area. Ask the store owner or an administrator
        to adjust your role if you need it.
      </p>
      <Button asChild variant="outline" className="mt-1">
        <Link to="/">Back to dashboard</Link>
      </Button>
    </div>
  );
}
