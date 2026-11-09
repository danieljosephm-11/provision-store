import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  BadgeIndianRupee,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Gift,
  Loader2,
  Mail,
  MessageCircle,
  Phone,
  Receipt,
  ShieldCheck,
  Sparkles,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { customerPaymentSchema, GST_STATES } from '@ps/shared';
import { api, ApiError, buildQuery } from '@/lib/api';
import { formatINR } from '@/lib/shared';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/contexts/auth';
import type {
  CustomerActivity,
  CustomerDetail,
  CustomerPayment,
  LedgerEntry,
  Paginated,
  Single,
  TimelineItem,
} from '@/lib/types';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable, type Column } from '@/components/shared/data-table';
import { Pagination } from '@/components/shared/pagination';
import { StatCard } from '@/components/shared/stat-card';
import { ErrorState } from '@/components/shared/states';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const PAYMENT_METHODS = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'OTHER'] as const;

const ACTIVITY_TYPES = [
  { value: 'NOTE', label: 'Note' },
  { value: 'CALL', label: 'Call' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'MEETING', label: 'Meeting' },
  { value: 'FOLLOW_UP', label: 'Follow-up' },
] as const;

function waLink(mobile: string, message?: string) {
  const base = `https://wa.me/91${mobile.replace(/\D/g, '').slice(-10)}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

export function CustomerDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [payOpen, setPayOpen] = React.useState(false);
  const [logOpen, setLogOpen] = React.useState(false);
  const [logType, setLogType] = React.useState<(typeof ACTIVITY_TYPES)[number]['value']>('NOTE');

  const { data: customer, isLoading, error, refetch } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => api.get<Single<CustomerDetail>>(`/customers/${id}`).then((res) => res.item),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-52" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (error || !customer) {
    return (
      <Card>
        <ErrorState
          title="Customer not found"
          message={error instanceof ApiError ? error.message : 'It may have been removed or you may not have access.'}
          onRetry={() => void refetch()}
        />
      </Card>
    );
  }

  const address = customer.addresses[0];
  const stateNameFor = (code?: string | null) =>
    GST_STATES.find((state) => state.code === code)?.name ?? code ?? '—';

  const openLog = (type: (typeof ACTIVITY_TYPES)[number]['value']) => {
    setLogType(type);
    setLogOpen(true);
  };

  return (
    <div>
      <PageHeader
        title={customer.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>{customer.code}</span>
            <span>· {customer.mobile}</span>
            {customer.email ? <span>· {customer.email}</span> : null}
            <Badge variant="outline">{customer.segment.replace(/_/g, ' ')}</Badge>
            <Badge variant={customer.isActive ? 'success' : 'secondary'}>
              {customer.isActive ? 'Active' : 'Inactive'}
            </Badge>
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/customers')}>
              <ArrowLeft className="h-4 w-4" /> Customers
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={`tel:+91${customer.mobile}`}>
                <Phone className="h-4 w-4" /> Call
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={waLink(customer.mobile)} target="_blank" rel="noreferrer">
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </a>
            </Button>
            {customer.email ? (
              <Button variant="outline" size="sm" asChild>
                <a href={`mailto:${customer.email}`}>
                  <Mail className="h-4 w-4" /> Email
                </a>
              </Button>
            ) : null}
            {can('customer.activity') ? (
              <Button variant="outline" size="sm" onClick={() => openLog('FOLLOW_UP')}>
                <CalendarDays className="h-4 w-4" /> Follow-up
              </Button>
            ) : null}
            {can('customer.payment') && customer.outstanding > 0 ? (
              <Button size="sm" onClick={() => setPayOpen(true)}>
                <CreditCard className="h-4 w-4" /> Record payment
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Outstanding"
          value={formatINR(customer.outstanding)}
          hint={customer.outstanding > 0 ? 'Balance due from customer' : 'Fully settled'}
          icon={BadgeIndianRupee}
          tone={customer.outstanding > 0 ? 'amber' : 'emerald'}
        />
        <StatCard
          label="Available credit"
          value={formatINR(customer.availableCredit)}
          hint={`Limit ${formatINR(customer.creditLimit)} · ${customer.creditDays} day terms`}
          icon={ShieldCheck}
          tone="sky"
        />
        <StatCard
          label="Lifetime spend"
          value={formatINR(customer.totalSpent)}
          hint={`${customer.totalPurchases} purchases · avg ${formatINR(customer.insights.averageOrderValue)}`}
          icon={Receipt}
          tone="violet"
        />
        <StatCard
          label="Loyalty points"
          value={String(customer.loyaltyPoints)}
          hint={`Last purchase ${customer.lastPurchaseAt ? formatDate(customer.lastPurchaseAt) : 'never'}`}
          icon={Gift}
          tone="rose"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Customer 360</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Tabs defaultValue="timeline" className="px-4 pb-4 pt-2">
                <TabsList>
                  <TabsTrigger value="timeline">Timeline</TabsTrigger>
                  <TabsTrigger value="invoices">Invoices</TabsTrigger>
                  <TabsTrigger value="ledger">Ledger</TabsTrigger>
                  <TabsTrigger value="payments">Payments</TabsTrigger>
                  <TabsTrigger value="loyalty">Loyalty</TabsTrigger>
                  <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
                </TabsList>

                <TabsContent value="timeline">
                  <TimelineTab
                    customer={customer}
                    onLog={() => openLog('NOTE')}
                    onFollowUp={() => openLog('FOLLOW_UP')}
                  />
                </TabsContent>

                <TabsContent value="invoices">
                  <DataTable
                    columns={[
                      {
                        key: 'no',
                        header: 'Invoice',
                        cell: (row) => (
                          <div>
                            <p className="font-medium">{row.invoiceNo}</p>
                            <p className="text-[11px] text-muted-foreground">{formatDate(row.createdAt, true)}</p>
                          </div>
                        ),
                      },
                      {
                        key: 'status',
                        header: 'Status',
                        cell: (row) => (
                          <div className="flex items-center gap-1.5">
                            <StatusBadge status={row.status} />
                            <StatusBadge status={row.paymentStatus} />
                          </div>
                        ),
                      },
                      {
                        key: 'total',
                        header: 'Total',
                        align: 'right',
                        cell: (row) => <span className="tabnum font-medium">{formatINR(row.grandTotal)}</span>,
                      },
                      {
                        key: 'balance',
                        header: 'Balance',
                        align: 'right',
                        cell: (row) => (
                          <span className="tabnum text-amber-700">{row.balanceDue > 0 ? formatINR(row.balanceDue) : '—'}</span>
                        ),
                      },
                    ]}
                    rows={customer.invoices}
                    rowKey={(row) => row.id}
                    onRowClick={(row) => navigate(`/invoices/${row.id}`)}
                    emptyTitle="No invoices yet"
                    emptyDescription="Sales billed to this customer appear here."
                  />
                </TabsContent>

                <TabsContent value="ledger">
                  <LedgerTable customerId={customer.id} />
                </TabsContent>

                <TabsContent value="payments">
                  {customer.payments.length === 0 ? (
                    <p className="py-8 text-center text-xs text-muted-foreground">No payments recorded.</p>
                  ) : (
                    <div className="divide-y rounded-lg border">
                      {customer.payments.map((payment) => (
                        <div key={payment.id} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
                          <div className="min-w-0">
                            <p className="font-medium">{payment.method.replace(/_/g, ' ')}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {formatDate(payment.paidAt, true)}
                              {payment.reference ? ` · ${payment.reference}` : ''}
                            </p>
                            {payment.note ? (
                              <p className="text-[11px] text-muted-foreground">{payment.note}</p>
                            ) : null}
                          </div>
                          <span className="tabnum font-medium">{formatINR(payment.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="loyalty">
                  {customer.loyaltyTransactions.length === 0 ? (
                    <p className="py-8 text-center text-xs text-muted-foreground">No loyalty activity yet.</p>
                  ) : (
                    <div className="divide-y rounded-lg border">
                      {customer.loyaltyTransactions.map((tx) => (
                        <div key={tx.id} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
                          <div className="min-w-0">
                            <p className="font-medium">
                              {tx.type.replace(/_/g, ' ')}
                              {tx.note ? ` — ${tx.note}` : ''}
                            </p>
                            <p className="text-[11px] text-muted-foreground">{formatDate(tx.createdAt, true)}</p>
                          </div>
                          <span className={`tabnum font-medium ${tx.points < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                            {tx.points > 0 ? '+' : ''}
                            {tx.points} pts
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="campaigns">
                  {customer.campaigns.length === 0 ? (
                    <p className="py-8 text-center text-xs text-muted-foreground">
                      This customer has not been included in a campaign yet.
                    </p>
                  ) : (
                    <div className="divide-y rounded-lg border">
                      {customer.campaigns.map((recipient) => (
                        <div key={recipient.id} className="space-y-1 px-3 py-2.5 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium">{recipient.campaign.name}</p>
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline">{recipient.campaign.channel}</Badge>
                              <StatusBadge status={recipient.status} />
                            </div>
                          </div>
                          <p className="text-[11px] text-muted-foreground">{recipient.campaign.message}</p>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] text-muted-foreground">
                              {recipient.sentAt ? `Sent ${formatDate(recipient.sentAt, true)}` : 'Not sent yet'}
                            </span>
                            <a
                              className="text-[11px] font-medium text-emerald-700 hover:underline"
                              href={waLink(customer.mobile, recipient.campaign.message)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open in WhatsApp
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                  <User className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium">{customer.name}</p>
                  <p className="text-[11px] text-muted-foreground">{customer.mobile}</p>
                </div>
              </div>
              {customer.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1 border-t pt-2">
                  {customer.tags.map((tag) => (
                    <Badge key={tag} variant="info">
                      {tag}
                    </Badge>
                  ))}
                </div>
              ) : null}
              {customer.gstin ? <Row label="GSTIN" value={customer.gstin} /> : null}
              {customer.email ? <Row label="Email" value={customer.email} /> : null}
              <Row label="Segment" value={customer.segment.replace(/_/g, ' ')} />
              <Row label="Credit terms" value={`${customer.creditDays} days`} />
              <Row label="Birthday" value={customer.birthday ? formatDate(customer.birthday) : '—'} />
              <Row label="Anniversary" value={customer.anniversary ? formatDate(customer.anniversary) : '—'} />
              <Row label="Customer since" value={formatDate(customer.createdAt)} />
              {customer.notes ? (
                <p className="border-t pt-2 text-xs text-muted-foreground">{customer.notes}</p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Buying insights</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Average order" value={formatINR(customer.insights.averageOrderValue)} />
              <Row
                label="Days since last purchase"
                value={
                  customer.insights.daysSinceLastPurchase === null
                    ? 'Never purchased'
                    : `${customer.insights.daysSinceLastPurchase} days`
                }
              />
              <Row
                label="Credit utilisation"
                value={`${Math.round(customer.insights.creditUtilization * 100)}%`}
              />
              <Row label="Returns" value={String(customer.insights.returnCount)} />
              {customer.insights.openFollowUp ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
                  <p className="font-medium">Next follow-up</p>
                  <p>{customer.insights.openFollowUp.subject}</p>
                  <p className="text-[11px]">
                    Due {customer.insights.openFollowUp.dueAt ? formatDate(customer.insights.openFollowUp.dueAt, true) : '—'}
                  </p>
                </div>
              ) : null}
              {customer.insights.favouriteProducts.length > 0 ? (
                <div className="border-t pt-2">
                  <p className="pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Favourite products
                  </p>
                  <ul className="space-y-1">
                    {customer.insights.favouriteProducts.map((product) => (
                      <li key={`${product.productId ?? product.name}`} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate">{product.name}</span>
                        <span className="shrink-0 text-muted-foreground">{formatINR(product.revenue)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Address</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {address ? (
                <address className="not-italic leading-5 text-muted-foreground">
                  {address.line1}
                  {address.line2 ? <span className="block">{address.line2}</span> : null}
                  <span className="block">
                    {[address.city, stateNameFor(address.stateCode), address.pincode].filter(Boolean).join(', ')}
                  </span>
                </address>
              ) : (
                <p className="text-xs text-muted-foreground">No address on file.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-emerald-200 bg-emerald-50/50">
            <CardContent className="flex items-start gap-2 p-4 text-xs text-emerald-800">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Credit sales fail at billing when the outstanding would exceed the limit. Every interaction you log
                here also appears in the CRM command centre.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <CustomerPaymentDialog open={payOpen} onOpenChange={setPayOpen} customer={customer} />
      <LogActivityDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        customer={customer}
        initialType={logType}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="truncate text-xs font-medium">{value}</span>
    </div>
  );
}

const KIND_META: Record<TimelineItem['kind'], { label: string; tone: string }> = {
  ACTIVITY: { label: 'Interaction', tone: 'bg-sky-100 text-sky-800' },
  INVOICE: { label: 'Invoice', tone: 'bg-violet-100 text-violet-800' },
  PAYMENT: { label: 'Payment', tone: 'bg-emerald-100 text-emerald-800' },
  RETURN: { label: 'Return', tone: 'bg-red-100 text-red-700' },
  LOYALTY: { label: 'Loyalty', tone: 'bg-amber-100 text-amber-800' },
};

function TimelineTab({
  customer,
  onLog,
  onFollowUp,
}: {
  customer: CustomerDetail;
  onLog: () => void;
  onFollowUp: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['customer', customer.id, 'timeline'],
    queryFn: () => api.get<{ items: TimelineItem[] }>(`/customers/${customer.id}/timeline`),
  });

  const complete = useMutation({
    mutationFn: (activityId: string) =>
      api.patch<Single<CustomerActivity>>(`/customers/${customer.id}/activities/${activityId}`, {
        completed: true,
      }),
    onSuccess: () => {
      toast.success('Follow-up marked complete');
      queryClient.invalidateQueries({ queryKey: ['customer', customer.id] });
      queryClient.invalidateQueries({ queryKey: ['crm'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not update the follow-up'),
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-3 pt-1">
      {can('customer.activity') ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onLog}>
            <ClipboardList className="h-4 w-4" /> Log interaction
          </Button>
          <Button variant="outline" size="sm" onClick={onFollowUp}>
            <CalendarDays className="h-4 w-4" /> Schedule follow-up
          </Button>
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-2 py-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-14" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-xs text-muted-foreground">
          No activity yet. Log a call, note or follow-up to start the timeline.
        </p>
      ) : (
        <ol className="relative space-y-2 border-l border-dashed pl-4">
          {items.map((item) => {
            const meta = KIND_META[item.kind];
            const isOpenFollowUp = item.kind === 'ACTIVITY' && !!item.dueAt && !item.completedAt;
            return (
              <li key={item.id} className="relative rounded-lg border bg-white px-3 py-2">
                <span className="absolute -left-[22px] top-3 flex h-3 w-3 items-center justify-center rounded-full border bg-white">
                  <span className={`h-1.5 w-1.5 rounded-full ${item.completedAt ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                </span>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full px-1.5 py-0 text-[10px] font-medium ${meta.tone}`}>{meta.label}</span>
                      {item.kind === 'ACTIVITY' ? (
                        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                          {item.type.replace(/_/g, ' ')}
                        </Badge>
                      ) : null}
                      {item.completedAt ? <StatusBadge status="COMPLETED" /> : null}
                      {isOpenFollowUp ? <StatusBadge status="PENDING" /> : null}
                    </div>
                    <p className="pt-0.5 text-sm font-medium text-slate-800">{item.title}</p>
                    {item.detail ? <p className="text-[11px] text-muted-foreground">{item.detail}</p> : null}
                    <p className="text-[11px] text-muted-foreground">
                      {formatDate(item.at, true)}
                      {item.author ? ` · ${item.author}` : ''}
                      {item.dueAt ? ` · due ${formatDate(item.dueAt, true)}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {item.amount !== null ? <span className="tabnum text-sm font-medium">{formatINR(item.amount)}</span> : null}
                    {item.link ? (
                      <Button variant="ghost" size="sm" onClick={() => navigate(item.link as string)}>
                        Open
                      </Button>
                    ) : null}
                    {isOpenFollowUp && can('customer.activity') ? (
                      <Button
                        variant="outline"
                        size="sm"
                        loading={complete.isPending && complete.variables === item.id.replace(/^activity-/, '')}
                        onClick={() => complete.mutate(item.id.replace(/^activity-/, ''))}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Done
                      </Button>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function LogActivityDialog({
  open,
  onOpenChange,
  customer,
  initialType,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: CustomerDetail;
  initialType: (typeof ACTIVITY_TYPES)[number]['value'];
}) {
  const queryClient = useQueryClient();
  const [type, setType] = React.useState<(typeof ACTIVITY_TYPES)[number]['value']>(initialType);
  const [subject, setSubject] = React.useState('');
  const [body, setBody] = React.useState('');
  const [dueAt, setDueAt] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setType(initialType);
    setSubject('');
    setBody('');
    setDueAt('');
    setError(null);
  }, [open, initialType]);

  const save = useMutation({
    mutationFn: (payload: unknown) =>
      api.post<Single<CustomerActivity>>(`/customers/${customer.id}/activities`, payload),
    onSuccess: () => {
      toast.success(type === 'FOLLOW_UP' ? 'Follow-up scheduled' : 'Interaction logged');
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ['customer', customer.id] });
      queryClient.invalidateQueries({ queryKey: ['customer', customer.id, 'timeline'] });
      queryClient.invalidateQueries({ queryKey: ['crm'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not save the activity'),
  });

  const submit = () => {
    setError(null);
    if (!subject.trim()) {
      setError('Add a short subject');
      return;
    }
    if (type === 'FOLLOW_UP' && !dueAt) {
      setError('Choose when the follow-up is due');
      return;
    }
    save.mutate({
      type,
      subject,
      body: body || null,
      dueAt: dueAt || null,
      completed: false,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !save.isPending && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{type === 'FOLLOW_UP' ? 'Schedule follow-up' : 'Log interaction'}</DialogTitle>
          <DialogDescription>{customer.name} · {customer.mobile}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <Field label="Type" required>
            <Select value={type} onChange={(event) => setType(event.target.value as typeof type)}>
              {ACTIVITY_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Subject" required>
            <Input
              value={subject}
              autoFocus
              maxLength={160}
              placeholder={type === 'FOLLOW_UP' ? 'Call about pending payment' : 'Discussed festive stock'}
              onChange={(event) => setSubject(event.target.value)}
            />
          </Field>
          <Field label="Details">
            <Textarea
              value={body}
              maxLength={2000}
              className="min-h-[72px]"
              onChange={(event) => setBody(event.target.value)}
            />
          </Field>
          <Field
            label={type === 'FOLLOW_UP' ? 'Due at' : 'Remind me at'}
            required={type === 'FOLLOW_UP'}
            hint={type === 'FOLLOW_UP' ? 'Shows in CRM follow-ups and alerts' : 'Optional reminder date'}
          >
            <Input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
          </Field>
          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button loading={save.isPending} onClick={submit}>
            {type === 'FOLLOW_UP' ? 'Schedule' : 'Save activity'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LedgerTable({ customerId }: { customerId: string }) {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(15);
  const { data, isLoading } = useQuery({
    queryKey: ['customer', customerId, 'ledger', { page, pageSize }],
    queryFn: () =>
      api.get<Paginated<LedgerEntry>>(`/customers/${customerId}/ledger${buildQuery({ page, pageSize })}`),
    placeholderData: keepPreviousData,
  });

  const columns: Column<LedgerEntry>[] = [
    {
      key: 'when',
      header: 'Date',
      cell: (row) => (
        <div>
          <p className="text-xs font-medium">{formatDate(row.entryDate)}</p>
          <p className="text-[10px] text-muted-foreground">#{row.seq}</p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Entry',
      cell: (row) => (
        <div>
          <Badge variant="outline">{row.type.replace(/_/g, ' ')}</Badge>
          <p className="pt-0.5 text-[11px] text-muted-foreground">{row.description ?? '—'}</p>
        </div>
      ),
    },
    {
      key: 'debit',
      header: 'Debit',
      align: 'right',
      cell: (row) => <span className="tabnum text-xs">{row.debit > 0 ? formatINR(row.debit) : '—'}</span>,
    },
    {
      key: 'credit',
      header: 'Credit',
      align: 'right',
      cell: (row) => <span className="tabnum text-xs">{row.credit > 0 ? formatINR(row.credit) : '—'}</span>,
    },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      cell: (row) => <span className="tabnum font-medium">{formatINR(row.balanceAfter)}</span>,
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={data?.items}
        rowKey={(row) => row.id}
        loading={isLoading}
        emptyTitle="No ledger entries"
        emptyDescription="Credit sales and payments post to this ledger."
      />
      <Pagination
        meta={data?.meta}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
    </>
  );
}

function CustomerPaymentDialog({
  open,
  onOpenChange,
  customer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: CustomerDetail;
}) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = React.useState('');
  const [method, setMethod] = React.useState<(typeof PAYMENT_METHODS)[number]>('CASH');
  const [reference, setReference] = React.useState('');
  const [note, setNote] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setAmount(String(customer.outstanding));
    setMethod('CASH');
    setReference('');
    setNote('');
    setError(null);
  }, [open, customer.outstanding]);

  const record = useMutation({
    mutationFn: (payload: unknown) => api.post<Single<CustomerPayment>>(`/customers/${customer.id}/payments`, payload),
    onSuccess: () => {
      toast.success('Payment recorded');
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ['customer', customer.id] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['crm'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not record the payment'),
  });

  const submit = () => {
    setError(null);
    const parsed = customerPaymentSchema.safeParse({
      amount: Number(amount) || 0,
      method,
      reference: reference || null,
      note: note || null,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the payment details');
      return;
    }
    record.mutate(parsed.data);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !record.isPending && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record customer payment</DialogTitle>
          <DialogDescription>
            {customer.name} · outstanding {formatINR(customer.outstanding)}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <Field label="Amount" required>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              autoFocus
              onChange={(event) => setAmount(event.target.value)}
              className="text-right tabnum"
            />
          </Field>
          <Field label="Method" required>
            <Select value={method} onChange={(event) => setMethod(event.target.value as typeof method)}>
              {PAYMENT_METHODS.map((option) => (
                <option key={option} value={option}>
                  {option.replace(/_/g, ' ')}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reference" hint="UPI reference, cheque number…">
            <Input value={reference} maxLength={120} onChange={(event) => setReference(event.target.value)} />
          </Field>
          <Field label="Note">
            <Textarea
              value={note}
              maxLength={500}
              className="min-h-[56px]"
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={record.isPending}>
            Cancel
          </Button>
          <Button loading={record.isPending} disabled={!(Number(amount) > 0)} onClick={submit}>
            Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CustomerDetailLoading() {
  return <Loader2 className="h-5 w-5 animate-spin" />;
}
