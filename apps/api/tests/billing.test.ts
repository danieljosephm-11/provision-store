import { describe, expect, it } from 'vitest';
import { computeInvoice, refundForReturn, sumPayments } from '@ps/shared';

describe('computeInvoice — GST inclusive', () => {
  it('back-calculates tax from a tax-inclusive price and rounds the payable to a rupee', () => {
    const result = computeInvoice([{ quantity: 1, unitPrice: 118, priceIncludesTax: true, taxRate: 18 }]);

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatchObject({
      grossAmount: 118,
      taxableAmount: 100,
      cgst: 9,
      sgst: 9,
      igst: 0,
      taxAmount: 18,
      lineTotal: 118,
    });
    expect(result.taxableAmount).toBe(100);
    expect(result.taxAmount).toBe(18);
    expect(result.roundOff).toBe(0);
    expect(result.grandTotal).toBe(118);
  });

  it('splits IGST for inter-state sales', () => {
    const result = computeInvoice([{ quantity: 1, unitPrice: 118, priceIncludesTax: true, taxRate: 18 }], {
      interState: true,
    });

    expect(result.lines[0]?.cgst).toBe(0);
    expect(result.lines[0]?.sgst).toBe(0);
    expect(result.lines[0]?.igst).toBe(18);
  });
});

describe('computeInvoice — GST exclusive', () => {
  it('adds tax on top of the price', () => {
    const result = computeInvoice([{ quantity: 2, unitPrice: 100, priceIncludesTax: false, taxRate: 5 }]);

    expect(result.subtotal).toBe(200);
    expect(result.taxableAmount).toBe(200);
    expect(result.cgst).toBe(5);
    expect(result.sgst).toBe(5);
    expect(result.taxAmount).toBe(10);
    expect(result.grandTotal).toBe(210);
  });

  it('handles cess on top of GST', () => {
    const result = computeInvoice([
      { quantity: 1, unitPrice: 100, priceIncludesTax: false, taxRate: 28, cessRate: 12 },
    ]);

    expect(result.taxAmount).toBe(40);
    expect(result.grandTotal).toBe(140);
  });
});

describe('computeInvoice — discounts', () => {
  it('applies a line discount before tax', () => {
    const result = computeInvoice([
      {
        quantity: 1,
        unitPrice: 100,
        priceIncludesTax: false,
        taxRate: 18,
        discount: { type: 'percent', value: 10 },
      },
    ]);

    expect(result.itemDiscount).toBe(10);
    expect(result.taxableAmount).toBe(90);
    expect(result.taxAmount).toBe(16.2);
    expect(result.grandTotal).toBe(106);
  });

  it('allocates a bill discount pro-rata across lines', () => {
    const result = computeInvoice(
      [
        { quantity: 1, unitPrice: 100, priceIncludesTax: false, taxRate: 0 },
        { quantity: 1, unitPrice: 300, priceIncludesTax: false, taxRate: 0 },
      ],
      { billDiscount: { type: 'flat', value: 40 }, roundToRupee: false },
    );

    expect(result.billDiscount).toBe(40);
    expect(result.lines[0]?.billDiscountShare).toBe(10);
    expect(result.lines[1]?.billDiscountShare).toBe(30);
    expect(result.taxableAmount).toBe(360);
    expect(result.grandTotal).toBe(360);
  });

  it('never discounts below zero', () => {
    const result = computeInvoice(
      [{ quantity: 1, unitPrice: 50, priceIncludesTax: false, taxRate: 0 }],
      { billDiscount: { type: 'flat', value: 500 }, roundToRupee: false },
    );

    expect(result.billDiscount).toBe(50);
    expect(result.taxableAmount).toBe(0);
    expect(result.grandTotal).toBe(0);
  });
});

describe('computeInvoice — validation', () => {
  it('returns zeroes for an empty basket', () => {
    const result = computeInvoice([]);
    expect(result.grandTotal).toBe(0);
    expect(result.lines).toEqual([]);
  });

  it('rejects zero or negative quantities', () => {
    expect(() =>
      computeInvoice([{ quantity: 0, unitPrice: 10, priceIncludesTax: false, taxRate: 5 }]),
    ).toThrow('Quantity must be greater than zero');
  });

  it('rejects invalid tax rates', () => {
    expect(() =>
      computeInvoice([{ quantity: 1, unitPrice: 10, priceIncludesTax: false, taxRate: 120 }]),
    ).toThrow('Tax rate must be between 0 and 100');
  });
});

describe('computeInvoice — rounding', () => {
  it('rounds the grand total to the nearest rupee and records the difference', () => {
    const result = computeInvoice([{ quantity: 1, unitPrice: 99.5, priceIncludesTax: false, taxRate: 0 }]);

    expect(result.grandTotal).toBe(100);
    expect(result.roundOff).toBe(0.5);
  });

  it('can disable rupee rounding', () => {
    const result = computeInvoice([{ quantity: 1, unitPrice: 99.5, priceIncludesTax: false, taxRate: 0 }], {
      roundToRupee: false,
    });

    expect(result.grandTotal).toBe(99.5);
    expect(result.roundOff).toBe(0);
  });
});

describe('refundForReturn', () => {
  it('refunds the proportional value of the returned quantity', () => {
    const refund = refundForReturn({ quantity: 4, lineTotal: 472, taxAmount: 72 }, 1);

    expect(refund.amount).toBe(118);
    expect(refund.taxAmount).toBe(18);
  });

  it('rejects returning more than was sold', () => {
    expect(() => refundForReturn({ quantity: 2, lineTotal: 100, taxAmount: 5 }, 3)).toThrow(
      'Invalid return quantity',
    );
  });
});

describe('sumPayments', () => {
  it('adds payment amounts without floating point drift', () => {
    expect(sumPayments([{ amount: 0.1 }, { amount: 0.2 }])).toBe(0.3);
  });
});
