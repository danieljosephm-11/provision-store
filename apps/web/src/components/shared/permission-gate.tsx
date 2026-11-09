import * as React from 'react';
import { useAuth } from '@/contexts/auth';
import { cn } from '@/lib/utils';

interface PermissionGateProps {
  permission: string | string[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
  mode?: 'hide' | 'disable';
}

/**
 * Hides UI a user cannot use. Server-side checks remain authoritative; this only
 * prevents dead controls from appearing.
 */
export function PermissionGate({ permission, children, fallback = null, mode = 'hide' }: PermissionGateProps) {
  const { can } = useAuth();
  const allowed = can(permission);
  if (allowed) return <>{children}</>;
  if (mode === 'disable') {
    return (
      <span className={cn('pointer-events-none opacity-50')} aria-disabled title="You do not have permission">
        {children}
      </span>
    );
  }
  return <>{fallback}</>;
}

export function usePermission(permission: string | string[]) {
  const { can } = useAuth();
  return can(permission);
}
