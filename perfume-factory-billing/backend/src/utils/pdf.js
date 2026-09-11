'use strict';

const PDFDocument = require('pdfkit');
const dayjs = require('dayjs');
const { paiseToRupees, formatRupees } = require('./money');

// Brand colors
const COLORS = {
  primary: '#0f2e24',       // Deep emerald
  accent: '#d97706',         // Amber
  lightBg: '#f8fafc',        // Off-white
  text: '#1e293b',           // Slate 800
  mutedText: '#64748b',      // Slate 500
  border: '#e2e8f0',         // Slate 200
  success: '#059669',        // Emerald 600
  warning: '#d97706',        // Amber
  danger: '#dc2626',         // Red
};

const PAYMENT_STATUS_COLORS = {
  PAID: COLORS.success,
  PARTIALLY_PAID: COLORS.warning,
  UNPAID: COLORS.danger,
};

/**
 * Generate an invoice PDF and pipe it to the response stream.
 * @param {object} data - complete invoice data from DB
 * @param {object} res - Express response object
 */
function generateInvoicePDF(data, res) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });

  // Stream directly to response
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="invoice-${data.bill_number}.pdf"`
  );
  doc.pipe(res);

  // ── Header / Factory Brand ─────────────────────────────────────────────
  doc.rect(0, 0, doc.page.width, 90).fill(COLORS.primary);

  doc.fillColor('white')
    .font('Helvetica-Bold')
    .fontSize(22)
    .text('🌸 PERFUME FACTORY', 40, 22, { align: 'left' });

  doc.fillColor('#d1fae5')
    .font('Helvetica')
    .fontSize(10)
    .text('Flower Procurement & Billing System', 40, 48, { align: 'left' });

  doc.fillColor('white')
    .font('Helvetica-Bold')
    .fontSize(14)
    .text('TAX INVOICE', 0, 30, { align: 'right', width: doc.page.width - 40 });

  doc.fillColor('#fef3c7')
    .font('Helvetica')
    .fontSize(11)
    .text(data.bill_number, 0, 48, { align: 'right', width: doc.page.width - 40 });

  // ── Bill Info Row ────────────────────────────────────────────────────────
  const infoY = 110;
  doc.fillColor(COLORS.text);

  // Left: Customer
  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.mutedText)
    .text('FARMER / SUPPLIER', 40, infoY);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(COLORS.text)
    .text(data.customer_name, 40, infoY + 14);
  doc.font('Helvetica').fontSize(10).fillColor(COLORS.mutedText)
    .text(data.customer_mobile || '', 40, infoY + 28)
    .text(data.village_name ? `Village: ${data.village_name}` : '', 40, infoY + 40);

  // Right: Invoice Date & Status
  const statusColor = PAYMENT_STATUS_COLORS[data.payment_status] || COLORS.text;
  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.mutedText)
    .text('INVOICE DATE', 350, infoY)
    .text('STATUS', 350, infoY + 42);

  doc.font('Helvetica').fontSize(11).fillColor(COLORS.text)
    .text(dayjs(data.collection_date).format('DD MMM YYYY'), 350, infoY + 14);

  doc.roundedRect(345, infoY + 54, 160, 20, 4).fill(statusColor);
  doc.fillColor('white').font('Helvetica-Bold').fontSize(10)
    .text(
      (data.payment_status || '').replace('_', ' '),
      345, infoY + 58,
      { align: 'center', width: 160 }
    );

  // ── Divider ────────────────────────────────────────────────────────────
  const tableTop = infoY + 90;
  doc.moveTo(40, tableTop - 10).lineTo(555, tableTop - 10).strokeColor(COLORS.border).stroke();

  // ── Items Table Header ─────────────────────────────────────────────────
  doc.rect(40, tableTop, 515, 22).fill(COLORS.primary);
  const cols = { flower: 40, weight: 220, rate: 330, amount: 440 };

  doc.fillColor('white').font('Helvetica-Bold').fontSize(9);
  doc.text('FLOWER / VARIETY', cols.flower + 5, tableTop + 7);
  doc.text('WEIGHT (KG)', cols.weight, tableTop + 7);
  doc.text('RATE (₹/KG)', cols.rate, tableTop + 7);
  doc.text('AMOUNT (₹)', cols.amount, tableTop + 7);

  // ── Items Rows ─────────────────────────────────────────────────────────
  let rowY = tableTop + 22;
  const items = data.items || [];
  let rowIndex = 0;

  for (const item of items) {
    const rowBg = rowIndex % 2 === 0 ? '#ffffff' : '#f8fafc';
    doc.rect(40, rowY, 515, 22).fill(rowBg);

    doc.fillColor(COLORS.text).font('Helvetica').fontSize(9);
    doc.text(item.flower_name, cols.flower + 5, rowY + 7, { width: 175, ellipsis: true });
    doc.text(parseFloat(item.weight_kg).toFixed(2), cols.weight, rowY + 7);
    doc.text(`₹${paiseToRupees(item.rate_per_kg_paise).toFixed(2)}`, cols.rate, rowY + 7);
    doc.text(`₹${paiseToRupees(item.amount_paise).toFixed(2)}`, cols.amount, rowY + 7);

    rowY += 22;
    rowIndex++;
  }

  // ── Totals Section ─────────────────────────────────────────────────────
  rowY += 10;
  doc.moveTo(40, rowY).lineTo(555, rowY).strokeColor(COLORS.border).stroke();
  rowY += 10;

  const totalsX = 350;
  const totalsValX = 460;

  function totalRow(label, valueStr, bold = false, color = COLORS.text) {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(bold ? 11 : 10)
      .fillColor(COLORS.mutedText)
      .text(label, totalsX, rowY);
    doc.fillColor(color)
      .text(valueStr, totalsValX, rowY, { align: 'right', width: 95 });
    rowY += 18;
  }

  const subtotal = (data.items || []).reduce((s, i) => s + Number(i.amount_paise || 0), 0);
  const discount = Number(data.discount_paise || 0);
  const otherCharges = Number(data.other_charges_paise || 0);
  const totalAmount = Number(data.total_amount_paise || 0);
  const paidAmount = Number(data.paid_amount_paise || 0);
  const pendingAmount = totalAmount - paidAmount;

  totalRow('Subtotal:', `₹${paiseToRupees(subtotal).toFixed(2)}`);
  if (discount > 0) totalRow('Discount:', `-₹${paiseToRupees(discount).toFixed(2)}`, false, COLORS.success);
  if (otherCharges > 0) totalRow('Other Charges:', `+₹${paiseToRupees(otherCharges).toFixed(2)}`);

  doc.moveTo(totalsX, rowY).lineTo(555, rowY).strokeColor(COLORS.border).stroke();
  rowY += 8;

  totalRow('TOTAL AMOUNT:', formatRupees(totalAmount), true, COLORS.primary);
  totalRow('Amount Paid:', formatRupees(paidAmount), false, COLORS.success);

  if (pendingAmount > 0) {
    totalRow('PENDING AMOUNT:', formatRupees(pendingAmount), true, COLORS.danger);
  }

  // ── Payment History ────────────────────────────────────────────────────
  if (data.payments && data.payments.length > 0) {
    rowY += 20;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.primary)
      .text('PAYMENT HISTORY', 40, rowY);
    rowY += 16;

    doc.rect(40, rowY, 515, 18).fill(COLORS.primary);
    doc.fillColor('white').font('Helvetica-Bold').fontSize(8);
    doc.text('#', 45, rowY + 5);
    doc.text('DATE', 70, rowY + 5);
    doc.text('MODE', 200, rowY + 5);
    doc.text('REFERENCE', 290, rowY + 5);
    doc.text('AMOUNT', 460, rowY + 5);
    rowY += 18;

    data.payments.forEach((pmt, idx) => {
      const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      doc.rect(40, rowY, 515, 18).fill(bg);
      doc.fillColor(COLORS.text).font('Helvetica').fontSize(8);
      doc.text(idx + 1, 45, rowY + 5);
      doc.text(dayjs(pmt.paid_at).format('DD MMM YYYY'), 70, rowY + 5);
      doc.text(pmt.payment_mode || 'CASH', 200, rowY + 5);
      doc.text(pmt.reference_number || '-', 290, rowY + 5);
      doc.text(`₹${paiseToRupees(pmt.amount_paise).toFixed(2)}`, 460, rowY + 5);
      rowY += 18;
    });
  }

  // ── Remarks ────────────────────────────────────────────────────────────
  if (data.remarks) {
    rowY += 20;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.mutedText)
      .text('REMARKS:', 40, rowY);
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.text)
      .text(data.remarks, 40, rowY + 14, { width: 515 });
  }

  // ── Footer ─────────────────────────────────────────────────────────────
  const footerY = doc.page.height - 60;
  doc.rect(0, footerY, doc.page.width, 60).fill(COLORS.primary);
  doc.fillColor('#d1fae5').font('Helvetica').fontSize(9)
    .text('This is a computer-generated invoice. No signature required.', 40, footerY + 12, {
      align: 'center',
      width: doc.page.width - 80,
    });
  doc.fillColor('#6ee7b7').fontSize(8)
    .text(
      `Generated: ${dayjs().format('DD MMM YYYY, HH:mm')} | Perfume Factory Billing System`,
      40,
      footerY + 30,
      { align: 'center', width: doc.page.width - 80 }
    );

  doc.end();
}

module.exports = { generateInvoicePDF };
