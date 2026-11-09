import dayjs from 'dayjs';

/** Indian financial year, April 1 → March 31. Returns "2026-27". */
export function financialYear(date: Date | string = new Date(), startMonth = 4): string {
  const d = dayjs(date);
  const year = d.month() + 1 >= startMonth ? d.year() : d.year() - 1;
  const end = String((year + 1) % 100).padStart(2, '0');
  return `${year}-${end}`;
}

/** Start and end (inclusive) of a financial year. */
export function financialYearRange(fy: string): { start: Date; end: Date } {
  const startYear = Number(fy.split('-')[0]);
  return {
    start: new Date(startYear, 3, 1, 0, 0, 0, 0),
    end: new Date(startYear + 1, 2, 31, 23, 59, 59, 999),
  };
}

export type DatePreset =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'thisMonth'
  | 'previousMonth'
  | 'custom';

export function presetRange(preset: DatePreset, from?: string, to?: string): { from: Date; to: Date } {
  const now = dayjs();
  switch (preset) {
    case 'today':
      return { from: now.startOf('day').toDate(), to: now.endOf('day').toDate() };
    case 'yesterday': {
      const y = now.subtract(1, 'day');
      return { from: y.startOf('day').toDate(), to: y.endOf('day').toDate() };
    }
    case 'last7':
      return { from: now.subtract(6, 'day').startOf('day').toDate(), to: now.endOf('day').toDate() };
    case 'last30':
      return { from: now.subtract(29, 'day').startOf('day').toDate(), to: now.endOf('day').toDate() };
    case 'thisMonth':
      return { from: now.startOf('month').toDate(), to: now.endOf('day').toDate() };
    case 'previousMonth': {
      const prev = now.subtract(1, 'month');
      return { from: prev.startOf('month').toDate(), to: prev.endOf('month').toDate() };
    }
    case 'custom':
      return {
        from: from ? dayjs(from).startOf('day').toDate() : now.startOf('month').toDate(),
        to: to ? dayjs(to).endOf('day').toDate() : now.endOf('day').toDate(),
      };
    default:
      return { from: now.startOf('day').toDate(), to: now.endOf('day').toDate() };
  }
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '—';
  return dayjs(value).format('DD MMM YYYY');
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return '—';
  return dayjs(value).format('DD MMM YYYY, hh:mm A');
}

export function formatDateInput(value: Date | string | null | undefined): string {
  if (!value) return '';
  return dayjs(value).format('YYYY-MM-DD');
}
