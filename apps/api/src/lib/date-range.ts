import { badRequest } from './errors';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normalise a date filter boundary.
 *
 * Date-only values (the format the UI sends from `<input type="date">`) are
 * inclusive of the whole day: `from` becomes local 00:00:00.000 and `to`
 * becomes local 23:59:59.999. Full timestamps are used exactly as supplied.
 */
function boundary(value: unknown, edge: 'from' | 'to'): Date | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const raw = String(value);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw badRequest(`Invalid ${edge} date`);
  if (DATE_ONLY.test(raw)) {
    if (edge === 'from') date.setHours(0, 0, 0, 0);
    else date.setHours(23, 59, 59, 999);
  }
  return date;
}

/** Parse `from`/`to` query filters so a `to` date includes that entire day. */
export function parseDateRange(query: Record<string, unknown>) {
  const from = boundary(query.from, 'from');
  const to = boundary(query.to, 'to');
  if (from && to && from > to) throw badRequest('The start date must be before the end date');
  return { from, to };
}
