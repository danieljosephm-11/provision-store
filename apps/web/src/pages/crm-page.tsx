import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  BadgeIndianRupee,
  Cake,
  CalendarDays,
  CheckCircle2,
  Download,
  Megaphone,
  MessageCircle,
  Phone,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  TrendingUp,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { campaignSchema } from '@ps/shared';
import { api, ApiError, buildQuery, openDocument } from '@/lib/api';
import { formatINR } from '@/lib/shared';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/contexts/auth';
import type {
  Campaign,
  CampaignDetail,
  CrmOverview,
  FollowUpResponse,
  Single,
} from '@/lib/types';
import { PageHeader } from '@/components/shared/page-header';
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
import { Switch } from '@/components/ui/controls';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const SEGMENTS = [
  { value: 'NEW', label: 'New' },
  { value: 'REGULAR', label: 'Regular' },
  { value: 'LOYAL', label: 'Loyal' },
  { value: 'HIGH_VALUE', label: 'High value' },
  { value: 'INACTIVE', label: 'Inactive' },
] as const;

const CHANNELS = ['WHATSAPP', 'SMS', 'EMAIL'] as const;

const MERGE_FIELDS = ['{name}', '{firstName}', '{points}', '{store}', '{outstanding}'];

function waLink(mobile: string, message?: string) {
  const base = `https://wa.me/91${mobile.replace(/\D/g, '').slice(-10)}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

function previewMessage(template: string, name: string, store: string) {
  const firstName = name.trim().split(/\s+/)[0] ?? name;
  return template
    .replaceAll('{name}', name)
    .replaceAll('{firstName}', firstName)
    .replaceAll('{points}', '0')
    .replaceAll('{store}', store)
    .replaceAll('{outstanding}', '0.00');
}

export function CrmPage() {
  const navigate = useNavigate();
  const { can, user } = useAuth();
  const queryClient = useQueryClient();
  const [campaignOpen, setCampaignOpen] = React.useState(false);
  const [openCampaignId, setOpenCampaignId] = React.useState<string | null>(null);
  const [followScope, setFollowScope] = React.useState<'open' | 'overdue' | 'today' | 'upcoming'>('open');

  const overview = useQuery({
    queryKey: ['crm', 'overview'],
    queryFn: () => api.get<Single<CrmOverview>>('/crm/overview').then((res) => res.item),
  });

  const followUps = useQuery({
    queryKey: ['crm', 'follow-ups', followScope],
    queryFn: () => api.get<FollowUpResponse>(`/customers/follow-ups${buildQuery({ scope: followScope })}`),
  });

  const campaigns = useQuery({
    queryKey: ['crm', 'campaigns'],
    queryFn: () => api.get<{ items: Campaign[] }>('/crm/campaigns'),
  });

  const completeFollowUp = useMutation({
    mutationFn: (item: { customerId: string; activityId: string }) =>
      api.patch(`/customers/${item.customerId}/activities/${item.activityId}`, { completed: true }),
    onSuccess: () => {
      toast.success('Follow-up completed');
      queryClient.invalidateQueries({ queryKey: ['crm'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not complete the follow-up'),
  });

  const recalc = useMutation({
    mutationFn: () =>
      api.post<Single<{ updated: number }>>('/customers/segments/recalculate').then((res) => res.item),
    onSuccess: (item) => {
      toast.success(`Segments refreshed · ${item.updated} customers updated`);
      queryClient.invalidateQueries({ queryKey: ['crm'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not recalculate segments'),
  });

  if (overview.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (overview.error || !overview.data) {
    return (
      <Card>
        <ErrorState
          title="CRM data unavailable"
          message={overview.error instanceof ApiError ? overview.error.message : 'Refresh the page to try again.'}
          onRetry={() => void overview.refetch()}
        />
      </Card>
    );
  }

  const data = overview.data;
  const storeName = user?.store.name ?? 'our store';
  const maxSegment = Math.max(1, ...data.segments.map((row) => row.count));

  return (
    <div>
      <PageHeader
        title="CRM command centre"
        description="Follow-ups, occasions, credit-due alerts, segments and WhatsApp campaigns in one place."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/customers')}>
              <Users className="h-4 w-4" /> All customers
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void openDocument(
                  '/customers/export',
                  'download',
                  `customers-${new Date().toISOString().slice(0, 10)}.csv`,
                )
              }
            >
              <Download className="h-4 w-4" /> Export
            </Button>
            {can('customer.update') ? (
              <Button variant="outline" size="sm" loading={recalc.isPending} onClick={() => recalc.mutate()}>
                <RefreshCw className="h-4 w-4" /> Refresh segments
              </Button>
            ) : null}
            {can('customer.campaign') ? (
              <Button size="sm" onClick={() => setCampaignOpen(true)}>
                <Megaphone className="h-4 w-4" /> New campaign
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active customers"
          value={String(data.totals.active)}
          hint={`${data.totals.newThisMonth} joined this month`}
          icon={Users}
          tone="emerald"
        />
        <StatCard
          label="Repeat customers"
          value={`${data.totals.repeatRate}%`}
          hint={`${data.totals.repeat} customers bought 2+ times`}
          icon={TrendingUp}
          tone="violet"
        />
        <StatCard
          label="At risk"
          value={String(data.totals.atRisk)}
          hint="No purchase for 60+ days"
          icon={AlertTriangle}
          tone="amber"
        />
        <StatCard
          label="Receivables"
          value={formatINR(data.receivables.reduce((sum, row) => sum + row.outstanding, 0))}
          hint={`${data.receivables.length} customers with credit dues`}
          icon={BadgeIndianRupee}
          tone="rose"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Follow-up queue</CardTitle>
              <span className="text-[11px] text-muted-foreground">
                {data.followUps.counts.overdue} overdue · {data.followUps.counts.today} today ·{' '}
                {data.followUps.counts.upcoming} upcoming
              </span>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ['open', 'All open'],
                    ['overdue', 'Overdue'],
                    ['today', 'Today'],
                    ['upcoming', 'Upcoming'],
                  ] as const
                ).map(([value, label]) => (
                  <Button
                    key={value}
                    size="sm"
                    variant={followScope === value ? 'secondary' : 'ghost'}
                    onClick={() => setFollowScope(value)}
                  >
                    {label}
                  </Button>
                ))}
              </div>

              {(followUps.data?.items ?? []).length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  Nothing due. Schedule follow-ups from any customer profile.
                </p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {(followUps.data?.items ?? []).slice(0, 10).map((item) => (
                    <li key={item.id} className="flex items-start justify-between gap-2 px-3 py-2.5">
                      <div className="min-w-0">
                        <button
                          type="button"
                          className="truncate text-sm font-medium text-slate-800 hover:text-emerald-700"
                          onClick={() => navigate(`/customers/${item.customer.id}`)}
                        >
                          {item.customer.name}
                        </button>
                        <p className="truncate text-[11px] text-muted-foreground">{item.subject}</p>
                        <p className={`text-[11px] ${item.overdue ? 'font-medium text-red-600' : 'text-muted-foreground'}`}>
                          Due {item.dueAt ? formatDate(item.dueAt, true) : '—'}
                          {item.overdue ? ' · overdue' : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button variant="ghost" size="iconSm" asChild title="Call">
                          <a href={`tel:+91${item.customer.mobile}`}>
                            <Phone className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                        <Button variant="ghost" size="iconSm" asChild title="WhatsApp">
                          <a href={waLink(item.customer.mobile)} target="_blank" rel="noreferrer">
                            <MessageCircle className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                        {can('customer.activity') ? (
                          <Button
                            variant="outline"
                            size="sm"
                            loading={completeFollowUp.isPending && completeFollowUp.variables?.activityId === item.id}
                            onClick={() =>
                              completeFollowUp.mutate({ customerId: item.customer.id, activityId: item.id })
                            }
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" /> Done
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Upcoming birthdays & anniversaries</CardTitle>
            </CardHeader>
            <CardContent>
              {data.occasions.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  Capture birthdays and anniversaries on customer profiles to see reminders here.
                </p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {data.occasions.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                            item.kind === 'BIRTHDAY' ? 'bg-rose-100 text-rose-700' : 'bg-violet-100 text-violet-700'
                          }`}
                        >
                          {item.kind === 'BIRTHDAY' ? <Cake className="h-4 w-4" /> : <CalendarDays className="h-4 w-4" />}
                        </span>
                        <div className="min-w-0">
                          <button
                            type="button"
                            className="truncate text-sm font-medium text-slate-800 hover:text-emerald-700"
                            onClick={() => navigate(`/customers/${item.customerId}`)}
                          >
                            {item.name}
                          </button>
                          <p className="text-[11px] text-muted-foreground">
                            {item.kind === 'BIRTHDAY' ? 'Birthday' : 'Anniversary'} {item.date} ·{' '}
                            {item.daysAway === 0 ? 'today' : `in ${item.daysAway} day${item.daysAway === 1 ? '' : 's'}`}
                          </p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" asChild>
                        <a
                          href={waLink(
                            item.mobile,
                            item.kind === 'BIRTHDAY'
                              ? `Happy birthday, ${item.name.split(' ')[0]}! Wishing you a wonderful year ahead from ${storeName}.`
                              : `Happy anniversary, ${item.name.split(' ')[0]}! Warm wishes from ${storeName}.`,
                          )}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <MessageCircle className="h-3.5 w-3.5" /> Greet
                        </a>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Campaigns</CardTitle>
              <span className="text-[11px] text-muted-foreground">
                {campaigns.data?.items.length ?? 0} total
              </span>
            </CardHeader>
            <CardContent className="space-y-2">
              {(campaigns.data?.items ?? []).length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  No campaigns yet. Build an audience and launch your first WhatsApp campaign.
                </p>
              ) : (
                (campaigns.data?.items ?? []).map((campaign) => (
                  <div key={campaign.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{campaign.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {campaign.channel} · {campaign.segment ?? 'All segments'}
                          {campaign.minSpend > 0 ? ` · min ${formatINR(campaign.minSpend)}` : ''}
                          {campaign.inactiveDays > 0 ? ` · inactive ${campaign.inactiveDays}d` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <StatusBadge status={campaign.status} />
                        <Badge variant="outline">
                          {campaign.sentCount}/{campaign.audienceCount || campaign.recipientCount} sent
                        </Badge>
                      </div>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                      {previewMessage(campaign.message, 'Sample Customer', storeName)}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Button variant="outline" size="sm" onClick={() => setOpenCampaignId(campaign.id)}>
                        Open <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                      {campaign.status === 'DRAFT' && can('customer.campaign') ? (
                        <LaunchButton campaign={campaign} />
                      ) : null}
                      {campaign.status === 'RUNNING' && can('customer.campaign') ? (
                        <CompleteButton campaign={campaign} />
                      ) : null}
                      {campaign.status === 'DRAFT' && can('customer.campaign') ? (
                        <DeleteButton campaign={campaign} />
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Credit-due alerts</CardTitle>
            </CardHeader>
            <CardContent>
              {data.receivables.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">No customers owe money right now.</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {data.receivables.map((row) => (
                    <li key={row.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
                      <div className="min-w-0">
                        <button
                          type="button"
                          className="truncate text-sm font-medium text-slate-800 hover:text-emerald-700"
                          onClick={() => navigate(`/customers/${row.id}`)}
                        >
                          {row.name}
                        </button>
                        <p className="text-[11px] text-muted-foreground">
                          {formatINR(row.outstanding)} due · limit {formatINR(row.creditLimit)} · {row.creditDays}d terms
                        </p>
                      </div>
                      <Button variant="outline" size="sm" asChild>
                        <a
                          href={waLink(
                            row.mobile,
                            `Hello ${row.name.split(' ')[0]}, this is a gentle reminder from ${storeName}. Your outstanding balance is ₹${row.outstanding.toFixed(2)}. Please let us know a convenient time to settle. Thank you!`,
                          )}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <MessageCircle className="h-3.5 w-3.5" /> Remind
                        </a>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Segment mix</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.segments.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">No segments yet.</p>
              ) : (
                data.segments.map((row) => (
                  <div key={row.segment}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{row.segment.replace(/_/g, ' ')}</span>
                      <span className="text-muted-foreground">{row.count}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${Math.round((row.count / maxSegment) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
              <div className="border-t pt-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Average lifetime value</span>
                  <span className="font-medium">{formatINR(data.totals.averageLifetimeValue)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Lifetime sales</span>
                  <span className="font-medium">{formatINR(data.totals.lifetimeSales)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top customers</CardTitle>
            </CardHeader>
            <CardContent>
              {data.topCustomers.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">No purchases recorded yet.</p>
              ) : (
                <ul className="space-y-2">
                  {data.topCustomers.map((row) => (
                    <li key={row.id} className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        className="min-w-0 text-left"
                        onClick={() => navigate(`/customers/${row.id}`)}
                      >
                        <p className="truncate text-sm font-medium text-slate-800 hover:text-emerald-700">{row.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {row.totalPurchases} purchases · {row.segment.replace(/_/g, ' ')}
                        </p>
                      </button>
                      <span className="tabnum shrink-0 text-sm font-medium">{formatINR(row.totalSpent)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="border-sky-200 bg-sky-50/50">
            <CardContent className="flex items-start gap-2 p-4 text-xs text-sky-900">
              <Megaphone className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Campaigns are provider-independent: we snapshot the audience, generate a personal WhatsApp link per
                customer, and track who you have marked as sent.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <CampaignDialog
        open={campaignOpen}
        onOpenChange={setCampaignOpen}
        storeName={storeName}
      />
      {openCampaignId ? (
        <CampaignDetailDialog
          campaignId={openCampaignId}
          open={!!openCampaignId}
          onOpenChange={(next) => !next && setOpenCampaignId(null)}
          storeName={storeName}
        />
      ) : null}
    </div>
  );
}

function useCampaignActions() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['crm'] });
  };
  return invalidate;
}

function LaunchButton({ campaign }: { campaign: Campaign }) {
  const invalidate = useCampaignActions();
  const [open, setOpen] = React.useState(false);
  const launch = useMutation({
    mutationFn: () => api.post<Single<Campaign>>(`/crm/campaigns/${campaign.id}/launch`),
    onSuccess: ({ item }) => {
      toast.success(`Campaign launched to ${item.audienceCount} customers`);
      setOpen(false);
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not launch the campaign'),
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !launch.isPending && setOpen(next)}>
      <Button variant="default" size="sm" onClick={() => setOpen(true)}>
        <Send className="h-3.5 w-3.5" /> Launch
      </Button>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Launch {campaign.name}?</DialogTitle>
          <DialogDescription>
            This snapshots the current audience ({campaign.audienceCount} customers) and creates a personal WhatsApp
            link for each customer. Messages are not sent automatically.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={launch.isPending}>
            Cancel
          </Button>
          <Button loading={launch.isPending} onClick={() => launch.mutate()}>
            Launch campaign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompleteButton({ campaign }: { campaign: Campaign }) {
  const invalidate = useCampaignActions();
  const complete = useMutation({
    mutationFn: () => api.post<Single<Campaign>>(`/crm/campaigns/${campaign.id}/complete`),
    onSuccess: () => {
      toast.success('Campaign completed');
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not complete the campaign'),
  });
  return (
    <Button variant="outline" size="sm" loading={complete.isPending} onClick={() => complete.mutate()}>
      <CheckCircle2 className="h-3.5 w-3.5" /> Complete
    </Button>
  );
}

function DeleteButton({ campaign }: { campaign: Campaign }) {
  const invalidate = useCampaignActions();
  const remove = useMutation({
    mutationFn: () => api.del(`/crm/campaigns/${campaign.id}`),
    onSuccess: () => {
      toast.success('Draft deleted');
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not delete the campaign'),
  });
  return (
    <Button variant="ghost" size="sm" loading={remove.isPending} onClick={() => remove.mutate()}>
      <Trash2 className="h-3.5 w-3.5" /> Delete
    </Button>
  );
}

interface CampaignFormState {
  name: string;
  channel: (typeof CHANNELS)[number];
  message: string;
  segment: string;
  minSpend: string;
  inactiveDays: string;
  includeInactive: boolean;
}

const emptyCampaign: CampaignFormState = {
  name: '',
  channel: 'WHATSAPP',
  message: 'Hi {firstName}, thanks for shopping with {store}!',
  segment: '',
  minSpend: '0',
  inactiveDays: '0',
  includeInactive: false,
};

function CampaignDialog({
  open,
  onOpenChange,
  storeName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeName: string;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState<CampaignFormState>(emptyCampaign);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setForm(emptyCampaign);
    setError(null);
  }, [open]);

  const audience = useQuery({
    queryKey: ['crm', 'audience', form.segment, form.minSpend, form.inactiveDays, form.includeInactive],
    queryFn: () =>
      api
        .get<Single<{ count: number; sample: { id: string; name: string; mobile: string; segment: string; totalSpent: number }[] }>>(
          `/crm/audience${buildQuery({
            segment: form.segment || undefined,
            minSpend: Number(form.minSpend) || 0,
            inactiveDays: Number(form.inactiveDays) || 0,
            includeInactive: form.includeInactive || undefined,
          })}`,
        )
        .then((res) => res.item),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: (payload: unknown) => api.post<Single<Campaign>>('/crm/campaigns', payload),
    onSuccess: ({ item }) => {
      toast.success(`Campaign created for ${item.audienceCount} customers`);
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ['crm'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not create the campaign'),
  });

  const submit = () => {
    setError(null);
    const parsed = campaignSchema.safeParse({
      name: form.name,
      channel: form.channel,
      message: form.message,
      segment: form.segment || null,
      minSpend: Number(form.minSpend) || 0,
      inactiveDays: Number(form.inactiveDays) || 0,
      includeInactive: form.includeInactive,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the campaign details');
      return;
    }
    create.mutate(parsed.data);
  };

  const sample = audience.data?.sample[0];

  return (
    <Dialog open={open} onOpenChange={(next) => !create.isPending && onOpenChange(next)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>New campaign</DialogTitle>
          <DialogDescription>
            Pick an audience, write one message and personalise it with merge fields. Nothing is sent until you open a
            recipient and send from WhatsApp.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Campaign name" required>
              <Input
                value={form.name}
                autoFocus
                maxLength={120}
                placeholder="Diwali WhatsApp offer"
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </Field>
            <Field label="Channel" required>
              <Select
                value={form.channel}
                onChange={(event) =>
                  setForm((current) => ({ ...current, channel: event.target.value as CampaignFormState['channel'] }))
                }
              >
                {CHANNELS.map((channel) => (
                  <option key={channel} value={channel}>
                    {channel}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Message" required hint={`Merge fields: ${MERGE_FIELDS.join(', ')}`}>
            <Textarea
              value={form.message}
              maxLength={1000}
              className="min-h-[100px]"
              onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
            />
          </Field>
          <div className="rounded-md border bg-slate-50/70 px-3 py-2 text-xs text-slate-700">
            <p className="pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Preview</p>
            {previewMessage(form.message, sample?.name ?? 'Sample Customer', storeName)}
          </div>

          <div className="space-y-3 rounded-lg border bg-slate-50/60 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Audience</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Segment">
                <Select
                  value={form.segment}
                  onChange={(event) => setForm((current) => ({ ...current, segment: event.target.value }))}
                >
                  <option value="">All segments</option>
                  {SEGMENTS.map((segment) => (
                    <option key={segment.value} value={segment.value}>
                      {segment.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Minimum lifetime spend">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.minSpend}
                  className="text-right tabnum"
                  onChange={(event) => setForm((current) => ({ ...current, minSpend: event.target.value }))}
                />
              </Field>
              <Field label="Inactive for days" hint="0 ignores this filter">
                <Input
                  type="number"
                  min="0"
                  max="3650"
                  value={form.inactiveDays}
                  className="text-right tabnum"
                  onChange={(event) => setForm((current) => ({ ...current, inactiveDays: event.target.value }))}
                />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={form.includeInactive}
                onCheckedChange={(checked) => setForm((current) => ({ ...current, includeInactive: checked }))}
              />
              Include inactive customers
            </label>
          </div>

          <div className="rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Audience preview</p>
              <Badge variant="info">{audience.data?.count ?? 0} customers</Badge>
            </div>
            {audience.data && audience.data.sample.length > 0 ? (
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                {audience.data.sample.map((customer) => (
                  <li key={customer.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate">{customer.name}</span>
                    <span className="shrink-0 text-muted-foreground">{formatINR(customer.totalSpent)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">No customers match these filters yet.</p>
            )}
          </div>

          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            Cancel
          </Button>
          <Button loading={create.isPending} onClick={submit}>
            Save draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CampaignDetailDialog({
  campaignId,
  open,
  onOpenChange,
  storeName,
}: {
  campaignId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeName: string;
}) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = React.useState<'ALL' | 'PENDING' | 'SENT'>('ALL');
  const { can } = useAuth();

  const detail = useQuery({
    queryKey: ['crm', 'campaign', campaignId],
    queryFn: () => api.get<Single<CampaignDetail>>(`/crm/campaigns/${campaignId}`).then((res) => res.item),
    enabled: open,
  });

  const markSent = useMutation({
    mutationFn: (recipientId: string) =>
      api.post(`/crm/campaigns/${campaignId}/recipients/${recipientId}/sent`),
    onSuccess: () => {
      toast.success('Marked as sent');
      queryClient.invalidateQueries({ queryKey: ['crm'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not update the recipient'),
  });

  const campaign = detail.data;
  const recipients = (campaign?.recipients ?? []).filter(
    (recipient) => statusFilter === 'ALL' || recipient.status === statusFilter,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{campaign?.name ?? 'Campaign'}</DialogTitle>
          <DialogDescription>
            {campaign
              ? `${campaign.channel} · ${campaign.audienceCount} audience · ${campaign.sentCount} sent`
              : 'Loading campaign…'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          {detail.isLoading || !campaign ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-14" />
              ))}
            </div>
          ) : (
            <>
              <div className="rounded-md border bg-slate-50/70 px-3 py-2 text-xs text-slate-700">
                <p className="pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Message template
                </p>
                {campaign.message}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    ['ALL', 'All'],
                    ['PENDING', 'Pending'],
                    ['SENT', 'Sent'],
                  ] as const
                ).map(([value, label]) => (
                  <Button
                    key={value}
                    size="sm"
                    variant={statusFilter === value ? 'secondary' : 'ghost'}
                    onClick={() => setStatusFilter(value)}
                  >
                    {label}
                  </Button>
                ))}
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {recipients.length} shown
                </span>
              </div>
              {recipients.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">No recipients in this view.</p>
              ) : (
                <ul className="max-h-[46vh] divide-y overflow-y-auto rounded-lg border">
                  {recipients.map((recipient) => (
                    <li key={recipient.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{recipient.customer.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {recipient.customer.mobile} · {formatINR(recipient.customer.totalSpent)} lifetime
                          {recipient.customer.outstanding > 0
                            ? ` · ${formatINR(recipient.customer.outstanding)} due`
                            : ''}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{recipient.message}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <StatusBadge status={recipient.status} />
                        {recipient.sentAt ? (
                          <span className="text-[10px] text-muted-foreground">{formatDate(recipient.sentAt, true)}</span>
                        ) : null}
                        <Button variant="outline" size="sm" asChild>
                          <a href={waLink(recipient.customer.mobile, recipient.message)} target="_blank" rel="noreferrer">
                            <MessageCircle className="h-3.5 w-3.5" /> Send
                          </a>
                        </Button>
                        {can('customer.campaign') && recipient.status !== 'SENT' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            loading={markSent.isPending && markSent.variables === recipient.id}
                            onClick={() => markSent.mutate(recipient.id)}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" /> Mark sent
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] text-muted-foreground">
                Tip: open WhatsApp, send the pre-filled message, then mark it sent so the campaign completion stays
                accurate. Greeting messages use {storeName} as the sender.
              </p>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
