import { useEffect } from 'react';
import { useAuth } from '@/contexts/auth';

/** Redirects the browser when a request fails with 401 and re-authentication is impossible. */
export function useUnauthorizedRedirect(onRedirect: () => void) {
  const { user } = useAuth();
  useEffect(() => {
    if (!user) onRedirect();
  }, [user, onRedirect]);
}
