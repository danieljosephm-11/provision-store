import { fromPaise, toPaise } from './money';

export type DiscountKind = 'percent' | 'flat';

export interface DiscountInput {
  type: DiscountKind;
  value: number;
}

export interface BillLineInput {
  quantity: number;
  unitPrice: number;
  /** true = MRP-style price already contains GST (Indian retail default per product) */
  priceIncludesTax: boolean;
  /** GST percentage, e.g. 5, 12, 18 */
  taxRate: number;
  cessRate?: number;
  discount?: DiscountInput | null;
}

export interface BillLineResult {
  grossAmount: number;
  discountAmount: number;
  discountPercent: number;
  billDiscountShare: number;
  taxableAmount: number;
  taxRate: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  taxAmount: number;
  lineTotal: number;
}

export interface InvoiceCalcOptions {
  interState?: boolean;
  billDiscount?: DiscountInput | null;
  roundToRupee?: boolean;
}

export interface InvoiceCalcResult {
  lines: BillLineResult[];
  subtotal: number;
  itemDiscount: number;
  billDiscount: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  taxAmount: number;
  roundOff: number;
  grandTotal: number;
}

const clampNonNegative = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

/**
 * Single source of truth for invoice mathematics.
 *
 * Order of operations:
 *  1. gross = qty × unit price
 *  2. line discount (percent or flat, capped at gross)
 *  3. bill discount allocated pro-rata across lines by discounted value
 *  4. GST: inclusive prices are back-calculated, exclusive prices are added
 *  5. CGST/SGST (intra-state) or IGST (inter-state)
 *  6. optional round-off to the nearest rupee
 *
 * Every step uses integer paise, so totals are deterministic and testable.
 */
export function computeInvoice(
  inputLines: BillLineInput[],
  options: InvoiceCalcOptions = {},
): InvoiceCalcResult {
  if (inputLines.length === 0) {
    return {
      lines: [],
      subtotal: 0,
      itemDiscount: 0,
      billDiscount: 0,
      taxableAmount: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      cess: 0,
      taxAmount: 0,
      roundOff: 0,
      grandTotal: 0,
    };
  }

  const prepared = inputLines.map((line) => {
    const qty = Number(line.quantity);
    const price = Number(line.unitPrice);
    const rate = Number(line.taxRate) || 0;
    const cessRate = Number(line.cessRate) || 0;
    if (!Number.isFinite(qty) || qty <= 0) throw new Error('Quantity must be greater than zero');
    if (!Number.isFinite(price) || price < 0) throw new Error('Unit price cannot be negative');
    if (rate < 0 || rate > 100) throw new Error('Tax rate must be between 0 and 100');
    if (cessRate < 0 || cessRate > 100) throw new Error('Cess rate must be between 0 and 100');

    const gross = toPaise(qty * price);
    let discount = 0;
    if (line.discount && line.discount.value > 0) {
      discount =
        line.discount.type === 'percent'
          ? Math.round((gross * clampNonNegative(line.discount.value)) / 100)
          : toPaise(clampNonNegative(line.discount.value));
    }
    discount = Math.min(discount, gross);
    return {
      gross,
      discount,
      net: gross - discount,
      rate,
      cessRate,
      inclusive: !!line.priceIncludesTax,
      qty,
      price,
    };
  });

  const totalNet = prepared.reduce((sum, l) => sum + l.net, 0);

  let billDiscountPaise = 0;
  if (options.billDiscount && options.billDiscount.value > 0) {
    billDiscountPaise =
      options.billDiscount.type === 'percent'
        ? Math.round((totalNet * clampNonNegative(options.billDiscount.value)) / 100)
        : toPaise(clampNonNegative(options.billDiscount.value));
    billDiscountPaise = Math.min(billDiscountPaise, totalNet);
  }

  let allocated = 0;
  const lines: BillLineResult[] = prepared.map((line, index) => {
    let share = 0;
    if (billDiscountPaise > 0 && totalNet > 0) {
      if (index === prepared.length - 1) {
        share = billDiscountPaise - allocated;
      } else {
        share = Math.round((billDiscountPaise * line.net) / totalNet);
      }
      share = Math.max(0, Math.min(share, line.net));
      allocated += share;
    }

    const net = line.net - share;
    const gstRate = line.rate / 100;
    const cessRate = line.cessRate / 100;

    let taxablePaise: number;
    let gstPaise: number;
    let cessPaise: number;
    let lineTotalPaise: number;

    if (line.inclusive) {
      // net already contains GST + cess: back-calculate the taxable value.
      taxablePaise = Math.round(net / (1 + gstRate + cessRate));
      const totalTax = net - taxablePaise;
      gstPaise = Math.round(taxablePaise * gstRate);
      cessPaise = totalTax - gstPaise;
      lineTotalPaise = net;
    } else {
      taxablePaise = net;
      gstPaise = Math.round(taxablePaise * gstRate);
      cessPaise = Math.round(taxablePaise * cessRate);
      lineTotalPaise = net + gstPaise + cessPaise;
    }

    const interState = !!options.interState;
    const cgstPaise = interState ? 0 : Math.floor(gstPaise / 2);
    const sgstPaise = interState ? 0 : gstPaise - cgstPaise;
    const igstPaise = interState ? gstPaise : 0;

    return {
      grossAmount: fromPaise(line.gross),
      discountAmount: fromPaise(line.discount),
      discountPercent:
        line.gross > 0 ? Math.round((line.discount / line.gross) * 10000) / 100 : 0,
      billDiscountShare: fromPaise(share),
      taxableAmount: fromPaise(taxablePaise),
      taxRate: line.rate,
      cgst: fromPaise(cgstPaise),
      sgst: fromPaise(sgstPaise),
      igst: fromPaise(igstPaise),
      cess: fromPaise(cessPaise),
      taxAmount: fromPaise(gstPaise + cessPaise),
      lineTotal: fromPaise(lineTotalPaise),
    };
  });

  const sum = (pick: (l: BillLineResult) => number) =>
    lines.reduce((acc, l) => acc + toPaise(pick(l)), 0);

  const subtotal = sum((l) => l.grossAmount);
  const itemDiscount = sum((l) => l.discountAmount);
  const billDiscount = sum((l) => l.billDiscountShare);
  const taxable = sum((l) => l.taxableAmount);
  const cgst = sum((l) => l.cgst);
  const sgst = sum((l) => l.sgst);
  const igst = sum((l) => l.igst);
  const cess = sum((l) => l.cess);
  const tax = cgst + sgst + igst + cess;
  const preRound = sum((l) => l.lineTotal);

  let roundOff = 0;
  let grandTotal = preRound;
  if (options.roundToRupee !== false) {
    const rounded = Math.round(preRound / 100) * 100;
    roundOff = rounded - preRound;
    grandTotal = rounded;
  }

  return {
    lines,
    subtotal: fromPaise(subtotal),
    itemDiscount: fromPaise(itemDiscount),
    billDiscount: fromPaise(billDiscount),
    taxableAmount: fromPaise(taxable),
    cgst: fromPaise(cgst),
    sgst: fromPaise(sgst),
    igst: fromPaise(igst),
    cess: fromPaise(cess),
    taxAmount: fromPaise(tax),
    roundOff: fromPaise(roundOff),
    grandTotal: fromPaise(grandTotal),
  };
}

/** Refund for a partial return, proportional to the original line value (tax included). */
export function refundForReturn(
  original: { quantity: number; lineTotal: number; taxAmount: number },
  returnQty: number,
): { amount: number; taxAmount: number } {
  const qty = Number(original.quantity);
  const rq = Number(returnQty);
  if (qty <= 0 || rq <= 0 || rq > qty) throw new Error('Invalid return quantity');
  const ratio = rq / qty;
  return {
    amount: fromPaise(Math.round(toPaise(original.lineTotal) * ratio)),
    taxAmount: fromPaise(Math.round(toPaise(original.taxAmount) * ratio)),
  };
}

export function sumPayments(payments: { amount: number }[]): number {
  return fromPaise(payments.reduce((acc, p) => acc + toPaise(p.amount), 0));
}
