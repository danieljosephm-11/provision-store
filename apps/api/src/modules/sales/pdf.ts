import PDFDocument from 'pdfkit';
import type { Store } from '@prisma/client';
import type { SerializedInvoice } from './invoice.serializer';

const money = (value: number) => `Rs. ${Number(value).toFixed(2)}`;
const qty = (value: number) => String(Math.round(Number(value) * 1000) / 1000);
const date = (value: Date | string | null) =>
  value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

function drawHeader(doc: PDFKit.PDFDocument, store: Store, title: string) {
  doc.font('Helvetica-Bold').fontSize(18).fillColor('#111827').text(store.name, { align: 'left' });
  doc.font('Helvetica').fontSize(9).fillColor('#4b5563');
  const address = [store.address, store.city, store.pincode].filter(Boolean).join(', ');
  if (address) doc.text(address);
  if (store.phone) doc.text(`Phone: ${store.phone}`);
  if (store.gstin) doc.text(`GSTIN: ${store.gstin}`);
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(14).text(title, { align: 'right' });
  doc.moveDown(0.5);
}

export function generateInvoicePdf(store: Store, invoice: SerializedInvoice): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      drawHeader(doc, store, 'TAX INVOICE');

      const top = doc.y;
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text('Bill To', 40, top + 4);
      doc.font('Helvetica').fontSize(9).fillColor('#374151');
      doc.text(invoice.customerName || 'Walk-in customer');
      if (invoice.customerMobile) doc.text(invoice.customerMobile);
      if (invoice.customer?.gstin) doc.text(`GSTIN: ${invoice.customer.gstin}`);

      doc.font('Helvetica').fontSize(9).fillColor('#374151');
      const metaX = 360;
      doc.text(`Invoice: ${invoice.invoiceNo}`, metaX, top + 4, { width: 195, align: 'right' });
      doc.text(`Date: ${date(invoice.createdAt)}`, metaX, undefined, { width: 195, align: 'right' });
      doc.text(`Place of supply: ${invoice.placeOfSupplyState ?? store.stateCode}`, metaX, undefined, {
        width: 195,
        align: 'right',
      });
      doc.text(`Payment: ${invoice.paymentStatus}`, metaX, undefined, { width: 195, align: 'right' });

      doc.moveDown(1.5);

      const columns = [
        { key: 'no', label: '#', width: 22, align: 'left' as const },
        { key: 'name', label: 'Item', width: 168, align: 'left' as const },
        { key: 'hsn', label: 'HSN', width: 40, align: 'left' as const },
        { key: 'qty', label: 'Qty', width: 45, align: 'right' as const },
        { key: 'rate', label: 'Rate', width: 58, align: 'right' as const },
        { key: 'disc', label: 'Disc', width: 42, align: 'right' as const },
        { key: 'taxable', label: 'Taxable', width: 62, align: 'right' as const },
        { key: 'gst', label: 'GST', width: 62, align: 'right' as const },
        { key: 'total', label: 'Amount', width: 65, align: 'right' as const },
      ];

      const drawHead = () => {
        const y = doc.y;
        doc.rect(40, y, 515, 18).fill('#eef2ff');
        doc.fillColor('#1f2937').font('Helvetica-Bold').fontSize(8);
        let x = 44;
        for (const col of columns) {
          doc.text(col.label, x, y + 5, { width: col.width - 4, align: col.align });
          x += col.width;
        }
        doc.y = y + 22;
        doc.font('Helvetica').fontSize(8).fillColor('#111827');
      };

      drawHead();

      invoice.items.forEach((item, index) => {
        if (doc.y > 700) {
          doc.addPage();
          drawHead();
        }
        const y = doc.y;
        const values: Record<string, string> = {
          no: String(index + 1),
          name: item.productName,
          hsn: item.hsn ?? '',
          qty: `${qty(item.quantity)} ${item.unit ?? ''}`.trim(),
          rate: money(item.unitPrice),
          disc: item.discountAmount > 0 ? money(item.discountAmount + item.billDiscountShare) : '—',
          taxable: money(item.taxableAmount),
          gst: `${item.taxRate}% ${money(item.taxAmount)}`,
          total: money(item.lineTotal),
        };
        let x = 44;
        const rowHeight = Math.max(
          14,
          doc.heightOfString(values.name ?? '', { width: columns[1]!.width - 4 }) + 4,
        );
        for (const col of columns) {
          doc.text(values[col.key] ?? '', x, y, { width: col.width - 4, align: col.align });
          x += col.width;
        }
        doc.y = y + rowHeight;
        doc
          .moveTo(40, doc.y)
          .lineTo(555, doc.y)
          .strokeColor('#e5e7eb')
          .lineWidth(0.5)
          .stroke();
      });

      doc.moveDown(0.8);
      const totalsY = doc.y;
      const labelX = 340;
      const valueX = 455;
      const line = (label: string, value: string, bold = false, color = '#374151') => {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(color);
        doc.text(label, labelX, doc.y, { width: 110, align: 'right' });
        doc.text(value, valueX, doc.y, { width: 96, align: 'right' });
      };

      doc.y = totalsY;
      line('Subtotal', money(invoice.subtotal));
      if (invoice.itemDiscount > 0) line('Item discount', `- ${money(invoice.itemDiscount)}`);
      if (invoice.billDiscount > 0) line('Bill discount', `- ${money(invoice.billDiscount)}`);
      line('Taxable value', money(invoice.taxableAmount));
      if (invoice.cgst > 0) line('CGST', money(invoice.cgst));
      if (invoice.sgst > 0) line('SGST', money(invoice.sgst));
      if (invoice.igst > 0) line('IGST', money(invoice.igst));
      if (invoice.cess > 0) line('Cess', money(invoice.cess));
      if (invoice.roundOff !== 0) line('Round off', money(invoice.roundOff));
      if (invoice.loyaltyDiscount > 0) line('Loyalty discount', `- ${money(invoice.loyaltyDiscount)}`);
      doc.moveDown(0.2);
      line('Grand total', money(invoice.grandTotal), true, '#111827');
      line('Paid', money(invoice.amountPaid));
      if (invoice.balanceDue > 0) line('Balance due', money(invoice.balanceDue), true, '#b91c1c');

      doc.y = Math.max(doc.y, totalsY + 20);
      doc.moveDown(1.5);
      if (store.invoiceTerms) {
        doc.font('Helvetica').fontSize(8).fillColor('#6b7280').text(store.invoiceTerms, 40, doc.y, {
          width: 515,
        });
      }
      if (store.billFooter) {
        doc.moveDown(0.5).fontSize(8).fillColor('#6b7280').text(store.billFooter, { width: 515, align: 'center' });
      }
      doc.moveDown(1).fontSize(8).fillColor('#9ca3af').text(
        `This is a computer generated invoice. ${invoice.status === 'VOID' ? 'VOIDED — ' : ''}Generated on ${new Date().toLocaleString('en-IN')}`,
        { align: 'center', width: 515 },
      );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

export function generateThermalPdf(store: Store, invoice: SerializedInvoice): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const width = 226; // 80mm
      const doc = new PDFDocument({ size: [width, 900], margin: 8, bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const contentWidth = width - 16;
      const center = (text: string, size = 8, bold = false) => {
        doc
          .font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(size)
          .fillColor('#111827')
          .text(text, { width: contentWidth, align: 'center' });
      };
      const row = (left: string, right: string, size = 8, bold = false) => {
        const y = doc.y;
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor('#111827');
        doc.text(left, 8, y, { width: contentWidth - 60, align: 'left' });
        doc.text(right, 8, y, { width: contentWidth, align: 'right' });
      };
      const divider = () => {
        doc.moveDown(0.3);
        doc
          .moveTo(8, doc.y)
          .lineTo(width - 8, doc.y)
          .strokeColor('#9ca3af')
          .lineWidth(0.5)
          .stroke();
        doc.moveDown(0.3);
      };

      center(store.name, 11, true);
      if (store.address) center([store.address, store.city].filter(Boolean).join(', '), 7);
      if (store.phone) center(`Ph: ${store.phone}`, 7);
      if (store.gstin) center(`GSTIN: ${store.gstin}`, 7);
      divider();
      center('TAX INVOICE', 9, true);
      row(`No: ${invoice.invoiceNo}`, date(invoice.createdAt));
      if (invoice.customerName) row('Customer', invoice.customerName);
      if (invoice.customerMobile) row('Mobile', invoice.customerMobile);
      divider();

      for (const item of invoice.items) {
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#111827').text(item.productName, 8, doc.y, {
          width: contentWidth,
        });
        const q = qty(item.quantity);
        row(
          `  ${q} ${item.unit ?? ''} x ${money(item.unitPrice)}${item.taxRate ? ` (GST ${item.taxRate}%)` : ''}`,
          money(item.lineTotal),
        );
        if (item.discountAmount + item.billDiscountShare > 0) {
          row('  Discount', `- ${money(item.discountAmount + item.billDiscountShare)}`, 7);
        }
      }
      divider();
      row('Subtotal', money(invoice.subtotal));
      if (invoice.itemDiscount + invoice.billDiscount > 0) {
        row('Discounts', `- ${money(invoice.itemDiscount + invoice.billDiscount)}`);
      }
      row('Taxable', money(invoice.taxableAmount));
      if (invoice.cgst > 0) row('CGST', money(invoice.cgst));
      if (invoice.sgst > 0) row('SGST', money(invoice.sgst));
      if (invoice.igst > 0) row('IGST', money(invoice.igst));
      if (invoice.cess > 0) row('Cess', money(invoice.cess));
      if (invoice.roundOff !== 0) row('Round off', money(invoice.roundOff));
      if (invoice.loyaltyDiscount > 0) row('Loyalty', `- ${money(invoice.loyaltyDiscount)}`);
      divider();
      row('TOTAL', money(invoice.grandTotal), 10, true);
      row('Paid', money(invoice.amountPaid));
      if (invoice.balanceDue > 0) row('Balance', money(invoice.balanceDue), 9, true);
      divider();
      center(store.billFooter || 'Thank you for shopping with us!', 8);
      if (invoice.status === 'VOID') center('*** VOIDED INVOICE ***', 9, true);
      center(`Printed ${new Date().toLocaleString('en-IN')}`, 6);

      // Trim page height to content for thermal printers.
      const height = Math.ceil(doc.y + 24);
      doc.end();
      // PDFKit page size cannot be resized after creation; 900pt roll length is fine.
      void height;
    } catch (error) {
      reject(error);
    }
  });
}
