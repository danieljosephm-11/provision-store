import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, FileBarChart, FileSpreadsheet, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError, buildQuery, openDocument } from '@/lib/api';
import { formatINR } from '@/lib/shared';
import { DEFAULT_FROM, DEFAULT_TO } from '@/lib/display';
import { formatDate, percent } from '@/lib/utils';
import { formatQty } from '@ps/shared';
import { useAuth } from '@/contexts/auth';
import type { ReportColumn, ReportResult, ReportSummaryItem, Single } from '@/lib/types';
import { PageHeader } from '@/components/shared/page-header';
import { DateRange } from '@/components/shared/date-range';
import { ErrorState } from '@/components/shared/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

function renderCell(value: unknown, type: ReportColumn['type']) {
  if (value === null || value === undefined || value === '') return '—';
  switch (type) {
    case 'money':
      return formatINR(Number(value));
    case 'qty':
      return formatQty(Number(value));
    case 'int':
      return Number(value).toLocaleString('en-IN');
    case 'percent':
      return percent(Number(value));
    case 'date':
      return formatDate(String(value));
    default:
      return String(value);
  }
}

export function ReportsPage() {
  const { can } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const active = searchParams.get('report') ?? 'sales-summary';
  const from = searchParams.get('from') ?? DEFAULT_FROM;
  const to = searchParams.get('to') ?? DEFAULT_TO;
  const [exporting, setExporting] = React.useState<string | null>(null);

  const updateParams = (patch: Record<string, string>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setSearchParams(next, { replace: true });
  };

  const { data: reports } = useQuery({
    queryKey: ['reports'],
    queryFn: () => api.get<{ items: ReportSummaryItem[] }>('/reports').then((res) => res.items),
  });

  const { data: report, isLoading, error, refetch } = useQuery({
    queryKey: ['report', active, from, to],
    queryFn: () =>
      api
        .get<Single<ReportResult>>(`/reports/${active}${buildQuery({ from, to })}`)
        .then((res) => res.item),
  });

  const exportReport = async (format: 'xlsx' | 'pdf') => {
    setExporting(format);
    try {
      await openDocument(
        `/reports/${active}/export${buildQuery({ format, from, to })}`,
        'download',
        `${active}-${from}-to-${to}.${format}`,
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not export the report');
    } finally {
      setExporting(null);
    }
  };

  const items = reports ?? [];

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Sales, GST, profit, inventory and receivables reports with Excel and PDF exports."
        actions={
          can('report.export') ? (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={exporting !== null}
                onClick={() => void exportReport('xlsx')}
              >
                {exporting === 'xlsx' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4" />
                )}
                Excel
              </Button>
              <Button variant="outline" size="sm" disabled={exporting !== null} onClick={() => void exportReport('pdf')}>
                {exporting === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                PDF
              </Button>
            </>
          ) : undefined
        }
      />

      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <Card className="h-fit lg:sticky lg:top-20">
          <CardHeader>
            <CardTitle>Report library</CardTitle>
          </CardHeader>
          <nav className="max-h-[70vh] overflow-y-auto p-1.5">
            {items.length === 0 ? (
              <p className="px-3 py-6 text-xs text-muted-foreground">Loading reports…</p>
            ) : (
              items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => updateParams({ report: item.key })}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors',
                    active === item.key
                      ? 'bg-primary/10 font-medium text-primary'
                      : 'text-slate-600 hover:bg-secondary',
                  )}
                >
                  <FileBarChart className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{item.title}</span>
                </button>
              ))
            )}
          </nav>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800">{report?.title ?? 'Report'}</p>
                <p className="text-[11px] text-muted-foreground">
                  {report ? `${formatDate(from)} – ${formatDate(to)}` : 'Choose a report from the library'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const now = new Date();
                    const iso = (date: Date) =>
                      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                    updateParams({ from: iso(now), to: iso(now) });
                  }}
                >
                  Today
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const now = new Date();
                    const start = new Date(now.getFullYear(), now.getMonth(), 1);
                    const iso = (date: Date) =>
                      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                    updateParams({ from: iso(start), to: iso(now) });
                  }}
                >
                  This month
                </Button>
                <DateRange
                  from={from}
                  to={to}
                  compact
                  onChange={(range) => updateParams({ from: range.from, to: range.to })}
                />
              </div>
            </CardContent>
          </Card>

          {isLoading ? (
            <Card>
              <CardContent className="space-y-2">
                <Skeleton className="h-8 w-40" />
                {Array.from({ length: 8 }).map((_, index) => (
                  <Skeleton key={index} className="h-9" />
                ))}
              </CardContent>
            </Card>
          ) : error || !report ? (
            <Card>
              <ErrorState
                title="Could not load the report"
                message={error instanceof ApiError ? error.message : undefined}
                onRetry={() => void refetch()}
              />
            </Card>
          ) : (
            <Card className="overflow-hidden">
              {report.summary && report.summary.length > 0 ? (
                <div className="flex flex-wrap gap-2 border-b bg-slate-50/60 px-4 py-3">
                  {report.summary.map((item) => (
                    <div key={item.label} className="rounded-md border bg-card px-3 py-1.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {item.label}
                      </p>
                      <p className="tabnum text-sm font-semibold text-slate-800">
                        {typeof item.value === 'number' ? item.value.toLocaleString('en-IN') : item.value}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-slate-50/80 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      {report.columns.map((column) => (
                        <th
                          key={column.key}
                          className={cn(
                            'whitespace-nowrap px-3 py-2 font-medium',
                            column.align === 'right' ? 'text-right' : 'text-left',
                          )}
                        >
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {report.rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={Math.max(1, report.columns.length)}
                          className="px-4 py-10 text-center text-xs text-muted-foreground"
                        >
                          No data for this period.
                        </td>
                      </tr>
                    ) : (
                      report.rows.map((row, index) => (
                        <tr key={index} className="hover:bg-slate-50/60">
                          {report.columns.map((column) => (
                            <td
                              key={column.key}
                              className={cn(
                                'whitespace-nowrap px-3 py-1.5',
                                column.align === 'right' && 'tabnum text-right',
                              )}
                            >
                              {renderCell(row[column.key], column.type)}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                  {report.totals && report.rows.length > 0 ? (
                    <tfoot className="border-t-2 bg-slate-50 font-medium">
                      <tr>
                        {report.columns.map((column, index) => (
                          <td
                            key={column.key}
                            className={cn(
                              'whitespace-nowrap px-3 py-2',
                              column.align === 'right' && 'tabnum text-right',
                            )}
                          >
                            {index === 0
                              ? 'Total'
                              : report.totals && report.totals[column.key] !== undefined
                                ? renderCell(report.totals[column.key], column.type)
                                : ''}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  ) : null}
                </table>
              </div>
              <div className="border-t px-4 py-2 text-[11px] text-muted-foreground">
                {report.rows.length} row{report.rows.length === 1 ? '' : 's'}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
