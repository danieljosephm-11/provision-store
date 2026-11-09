import * as React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, LockKeyhole, Mail, ShieldCheck, Store } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';

export function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const from = (location.state as { from?: string } | null)?.from ?? '/';

  React.useEffect(() => {
    if (user) navigate(from, { replace: true });
  }, [user, from, navigate]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password');
      return;
    }
    setLoading(true);
    try {
      const signedIn = await login(email.trim(), password);
      toast.success(`Welcome back, ${signedIn.name.split(' ')[0]}`);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign in. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-slate-950 lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(16,185,129,0.22),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(59,130,246,0.14),transparent_50%)]" />
        <div className="relative p-10 xl:p-14">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-400/30">
              <Store className="h-5 w-5" />
            </span>
            <div>
              <p className="text-base font-semibold text-white">Provision Store</p>
              <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-400/80">Retail operating system</p>
            </div>
          </div>

          <h1 className="mt-16 max-w-md text-3xl font-semibold leading-tight text-white xl:text-4xl">
            Every sale, every packet, every rupee — accounted for.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-400">
            Billing, stock, credit customers, supplier ledgers, GST returns and business analytics in one
            dependable system built for Indian provision stores.
          </p>

          <div className="mt-10 grid max-w-md gap-4 sm:grid-cols-2">
            {[
              { title: 'GST-compliant billing', body: 'HSN, CGST/SGST/IGST, inclusive or exclusive pricing per product.' },
              { title: 'Live stock ledger', body: 'Weighted average costing and an append-only movement history.' },
              { title: 'Customer credit', body: 'Limits, ledgers, ageing and loyalty points with zero guesswork.' },
              { title: 'Role-based access', body: '57 granular permissions so staff only see what they need.' },
            ].map((item) => (
              <div key={item.title} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-sm font-medium text-white">{item.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="relative border-t border-white/10 p-6 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> JWT sessions · bcrypt password hashing · audited actions
          </span>
        </div>
      </div>

      <div className="flex items-center justify-center bg-background px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Store className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold">Provision Store</p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Store management</p>
            </div>
          </div>

          <h2 className="text-xl font-semibold tracking-tight">Sign in to your store</h2>
          <p className="mt-1 text-sm text-muted-foreground">Use the employee account assigned to you.</p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            <Field label="Email address" htmlFor="email" required>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@store.com"
                  className="pl-8"
                />
              </div>
            </Field>

            <Field label="Password" htmlFor="password" required>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••••"
                  className="pl-8 pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-secondary"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>

            {error ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                {error}
              </div>
            ) : null}

            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          {import.meta.env.DEV ? (
            <div className="mt-6 rounded-lg border border-dashed bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
              <p className="font-semibold text-slate-700">First-run administrator</p>
              <p className="mt-1">
                Email: <span className="font-mono text-slate-700">admin@provisionstore.local</span>
                <br />
                Password: the value configured as <code>SEED_ADMIN_PASSWORD</code>
              </p>
              <p className="mt-1">Use a unique password and change it from Settings after your first sign-in.</p>
            </div>
          ) : null}

          <p className="mt-8 text-center text-[11px] text-muted-foreground">
            Protected by role-based access control. Activity is recorded in the audit log.
          </p>
        </div>
      </div>
    </div>
  );
}
