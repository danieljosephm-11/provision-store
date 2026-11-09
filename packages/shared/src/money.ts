/**
 * Money helpers. All monetary arithmetic is performed in integer paise so that
 * floating point drift can never reach an invoice or a ledger.
 */
export const toPaise = (value: number): number => Math.round(value * 100);
export const fromPaise = (paise: number): number => paise / 100;

export const round2 = (value: number): number => Math.round(value * 100) / 100;

export function formatINR(value: number | string, opts?: { compact?: boolean }): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '₹0.00';
  if (opts?.compact) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(n);
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatQty(value: number | string, decimals = 3): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '0';
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(n);
}

export function formatNumber(value: number | string): string {
  const n = typeof value === 'string' ? Number(value) : value;
  return new Intl.NumberFormat('en-IN').format(Number.isFinite(n) ? n : 0);
}

/** GSTIN: 2 digit state + PAN + entity + Z + checksum. */
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const HSN_REGEX = /^[0-9]{4,8}$/;
export const INDIAN_MOBILE_REGEX = /^[6-9][0-9]{9}$/;
export const PINCODE_REGEX = /^[1-9][0-9]{5}$/;

export function isValidGstin(value: string | null | undefined): boolean {
  return !!value && GSTIN_REGEX.test(value.trim().toUpperCase());
}
