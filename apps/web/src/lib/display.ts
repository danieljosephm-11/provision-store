import { formatDate, monthStartISO, percent, todayISO } from '@/lib/utils';
import { formatINR } from '@/lib/shared';
import type { DashboardData } from '@/lib/types';

export const DEFAULT_FROM = monthStartISO();
export const DEFAULT_TO = todayISO();

export const money = formatINR;
export const date = formatDate;
export const pct = percent;

export type { DashboardData };
