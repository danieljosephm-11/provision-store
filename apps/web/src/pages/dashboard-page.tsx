import * as React from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CalendarClock,
  IndianRupee,
  Package,
  Receipt,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { api, buildQuery } from '@/lib/api';
import type { DashboardData, Single } from '@/lib/types';
import { formatINR } from '@/lib/shared';
import { addDaysISO, formatDate, monthStartISO, percent, todayISO } from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { DateRange } from '@/components/shared/date-range';
import { ErrorState } from '@/components/shared/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/badge';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

const CHART_COLORS = ['#059669', '#0ea5e9', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6', '#64748b', '#e11d48'];

function ChartCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>{title}</CardTitle>
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        </div>
      </CardHeader>
      <CardContent className="pt-4">{children}</CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const [range, setRange] = React.useState({ from: monthStartISO(), to: todayISO() });

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['dashboard', range],
    queryFn: () =>
      api
        .get<Single<DashboardData>>(`/dashboard${buildQuery({ from: range.from, to: range.to })}`)
        .then((res) => res.item),
    placeholderData: keepPreviousData,
  });

  const trend = React.useMemo(
    () =>
      (data?.trends ?? []).map((row) => ({
        ...row,
        label: row.day.slice(5).replace('-', '/'),
      })),
    [data],
  );

  const inboundPayments = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const row of data?.paymentBreakdown ?? []) {
      if (row.direction !== 'IN') continue;
      map.set(row.method, (map.get(row.method) ?? 0) + row.total);
    }
    return [...map.entries()]
      .map(([method, total]) => ({ method: method.replace(/_/g, ' '), total }))
      .sort((a, b) => b.total - a.total);
  }, [data]);

  const presets = [
    { label: 'Today', from: todayISO(), to: todayISO() },
    { label: 'Last 7 days', from: addDaysISO(-6), to: todayISO() },
    { label: 'Last 30 days', from: addDaysISO(-29), to: todayISO() },
    { label: 'This month', from: monthStartISO(), to: todayISO() },
  ];

  return (
    <div>
      <PageHeader
        title="Business overview"
        description="Live performance for your store, straight from the sales and stock ledgers."
        actions={
          <>
            <DateRange from={range.from} to={range.to} onChange={setRange} compact />
            <Button variant="outline" size="sm" onClick={() => refetch()} loading={isFetching && !isLoading}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          </>
        }
      >
        <div className="mt-2 flex flex-wrap gap-1">
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => setRange({ from: preset.from, to: preset.to })}
              className="rounded-full border px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground transition hover:border-primary/40 hover:text-primary"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </PageHeader>

      {error ? (
        <Card>
          <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => refetch()} />
        </Card>
      ) : isLoading || !data ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-[104px]" />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-[320px] lg:col-span-2" />
            <Skeleton className="h-[320px]" />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Today's sales"
              value={formatINR(data.today.sales)}
              icon={IndianRupee}
              tone="success"
              hint={`${data.today.invoices} invoice${data.today.invoices === 1 ? '' : 's'} · avg ${formatINR(data.today.averageBill)}`}
            />
            <StatCard
              label="Period sales"
              value={formatINR(data.period.sales)}
              icon={TrendingUp}
              hint={`${data.period.invoices} invoices · ${formatDate(range.from)} – ${formatDate(range.to)}`}
            />
            <StatCard
              label="Gross profit"
              value={formatINR(data.period.grossProfit)}
              icon={Wallet}
              tone={data.period.grossProfit >= 0 ? 'success' : 'danger'}
              hint={`${percent(data.period.grossMargin)} margin · COGS ${formatINR(data.period.cogs)}`}
            />
            <StatCard
              label="Net profit"
              value={formatINR(data.period.netProfit)}
              icon={Banknote}
              tone={data.period.netProfit >= 0 ? 'info' : 'danger'}
              hint={`After ${formatINR(data.period.expenses)} expenses`}
            />
            <StatCard
              label="Receivables"
              value={formatINR(data.receivables.total)}
              icon={Users}
              tone="warning"
              hint={`${data.receivables.customers} customer${data.receivables.customers === 1 ? '' : 's'} with dues`}
            />
            <StatCard
              label="Payables"
              value={formatINR(data.payables.total)}
              icon={ShoppingBag}
              hint={`${data.payables.suppliers} supplier${data.payables.suppliers === 1 ? '' : 's'} to settle`}
            />
            <StatCard
              label="GST collected"
              value={formatINR(data.period.tax)}
              icon={Receipt}
              hint="CGST + SGST + IGST + cess in period"
            />
            <StatCard
              label="Stock alerts"
              value={`${data.counts.lowStock + data.counts.outOfStock}`}
              icon={AlertTriangle}
              tone={data.counts.outOfStock > 0 ? 'danger' : 'warning'}
              hint={`${data.counts.lowStock} low · ${data.counts.outOfStock} out of stock`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ChartCard title="Sales trend" description="Invoiced value by day">
                {trend.length === 0 ? (
                  <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
                    No sales in this period
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#059669" stopOpacity={0.28} />
                          <stop offset="100%" stopColor="#059669" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                        width={64}
                        tickFormatter={(value: number) => formatINR(value, { compact: true })}
                      />
                      <ReTooltip
                        formatter={(value: number) => [formatINR(value), 'Sales']}
                        labelFormatter={(label: string) => `Day ${label}`}
                        contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 12 }}
                      />
                      <Area type="monotone" dataKey="total" stroke="#059669" strokeWidth={2} fill="url(#salesFill)" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </div>

            <ChartCard title="Category mix" description="Share of sales value">
              {data.categorySales.length === 0 ? (
                <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
                  No category sales yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={data.categorySales}
                      dataKey="total"
                      nameKey="name"
                      innerRadius={62}
                      outerRadius={96}
                      paddingAngle={2}
                      strokeWidth={2}
                    >
                      {data.categorySales.map((entry, index) => (
                        <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <ReTooltip
                      formatter={(value: number, name: string) => [formatINR(value), name]}
                      contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 12 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
              <div className="mt-2 space-y-1.5">
                {data.categorySales.slice(0, 4).map((row, index) => (
                  <div key={row.name} className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                      />
                      <span className="truncate text-muted-foreground">{row.name}</span>
                    </span>
                    <span className="font-medium tabnum">{formatINR(row.total)}</span>
                  </div>
                ))}
              </div>
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard title="Payments received" description="By tender method">
              {inboundPayments.length === 0 ? (
                <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
                  No payments recorded in this period
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={inboundPayments} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="method" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      axisLine={false}
                      tickLine={false}
                      width={58}
                      tickFormatter={(value: number) => formatINR(value, { compact: true })}
                    />
                    <ReTooltip
                      formatter={(value: number) => [formatINR(value), 'Received']}
                      contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 12 }}
                    />
                    <Bar dataKey="total" fill="#0ea5e9" radius={[4, 4, 0, 0]} maxBarSize={42} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Top products</CardTitle>
                <Link to="/reports" className="text-[11px] font-medium text-primary hover:underline">
                  All reports
                </Link>
              </CardHeader>
              <CardContent className="p-0">
                {data.topProducts.length === 0 ? (
                  <p className="px-5 py-10 text-center text-xs text-muted-foreground">No product sales yet</p>
                ) : (
                  <div className="divide-y">
                    {data.topProducts.slice(0, 5).map((product, index) => (
                      <div key={product.name} className="flex items-center gap-3 px-4 py-2.5">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-100 text-[10px] font-semibold text-slate-500">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium">{product.name}</p>
                          <p className="text-[10px] text-muted-foreground">Qty sold {product.quantity}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-medium tabnum">{formatINR(product.revenue)}</p>
                          <p className="text-[10px] text-emerald-600 tabnum">+{formatINR(product.profit)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Top customers</CardTitle>
                <Link to="/customers" className="text-[11px] font-medium text-primary hover:underline">
                  View customers
                </Link>
              </CardHeader>
              <CardContent className="p-0">
                {data.topCustomers.length === 0 ? (
                  <p className="px-5 py-10 text-center text-xs text-muted-foreground">No customer sales yet</p>
                ) : (
                  <div className="divide-y">
                    {data.topCustomers.slice(0, 5).map((customer) => (
                      <div key={customer.name} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium">{customer.name}</p>
                          <p className="text-[10px] text-muted-foreground">{customer.invoices} invoices</p>
                        </div>
                        <p className="text-xs font-medium tabnum">{formatINR(customer.total)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Recent invoices</CardTitle>
                <Link to="/invoices" className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
                  Open register <ArrowRight className="h-3 w-3" />
                </Link>
              </CardHeader>
              <CardContent className="p-0">
                {data.recentInvoices.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 px-5 py-12 text-center">
                    <Receipt className="h-6 w-6 text-slate-300" />
                    <p className="text-sm font-medium text-slate-600">No invoices yet</p>
                    <p className="text-xs text-muted-foreground">Ring up your first sale at the point of sale.</p>
                    <Button asChild size="sm" className="mt-1">
                      <Link to="/pos">Open POS</Link>
                    </Button>
                  </div>
                ) : (
                  <Table>
                    <THead>
                      <TR>
                        <TH>Invoice</TH>
                        <TH>Customer</TH>
                        <TH>Date</TH>
                        <TH>Status</TH>
                        <TH className="text-right">Total</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {data.recentInvoices.map((invoice) => (
                        <TR key={invoice.id}>
                          <TD>
                            <Link to={`/invoices/${invoice.id}`} className="font-medium text-primary hover:underline">
                              {invoice.invoiceNo}
                            </Link>
                          </TD>
                          <TD className="max-w-[160px] truncate">{invoice.customerName ?? 'Walk-in'}</TD>
                          <TD className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(invoice.createdAt, true)}</TD>
                          <TD>
                            <StatusBadge status={invoice.status === 'VOID' ? 'VOID' : invoice.paymentStatus} />
                          </TD>
                          <TD className="text-right font-medium tabnum">{formatINR(invoice.grandTotal)}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <div className="space-y-3">
              <Card>
                <CardHeader>
                  <CardTitle>Inventory health</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Package className="h-4 w-4" /> Active products
                    </span>
                    <span className="font-semibold tabnum">{data.counts.products}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <AlertTriangle className="h-4 w-4 text-amber-500" /> Low stock
                    </span>
                    <span className="font-semibold tabnum text-amber-600">{data.counts.lowStock}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <AlertTriangle className="h-4 w-4 text-red-500" /> Out of stock
                    </span>
                    <span className="font-semibold tabnum text-red-600">{data.counts.outOfStock}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <CalendarClock className="h-4 w-4 text-sky-500" /> Expiring in 30 days
                    </span>
                    <span className="font-semibold tabnum text-sky-600">{data.counts.expiring}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Expiring stock value {formatINR(data.counts.expiringValue)}
                  </p>
                  <Button asChild variant="outline" size="sm" className="w-full">
                    <Link to="/inventory">Manage stock</Link>
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Customers</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Active customers</span>
                    <span className="font-semibold tabnum">{data.counts.customers}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Outstanding dues</span>
                    <span className="font-semibold tabnum text-amber-600">{formatINR(data.receivables.total)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Supplier payables</span>
                    <span className="font-semibold tabnum text-rose-600">{formatINR(data.payables.total)}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
