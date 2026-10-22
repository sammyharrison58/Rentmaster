// pdf.js - PDF Receipt and Tenant Statement Generator using jsPDF

import { formatKES, formatDate, formatMonth, formatPhone } from './store.js';

export async function generateReceiptPDF(payment, propertyName = 'Rent Portal') {
  if (typeof window.jspdf === 'undefined') {
    // If jsPDF CDN not yet loaded, trigger print
    window.print();
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a5' });
  const startX = 14;
  const endX = 134;

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(propertyName || 'Rent Portal', startX, 20);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text('Official rent payment receipt', startX, 26);

  // Emerald Divider line
  doc.setDrawColor(5, 150, 105);
  doc.setLineWidth(0.6);
  doc.line(startX, 31, endX, 31);

  // Amount Paid Section
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text('Amount paid', startX, 41);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(15, 23, 42);
  doc.text(formatKES(payment.amount), startX, 50);

  doc.setFontSize(12);
  doc.setTextColor(5, 150, 105);
  doc.text('PAID', endX, 50, { align: 'right' });

  // Fields
  let currentY = 63;
  const fields = [
    ['Receipt number', payment.receiptNo || `RCT-${payment.month.replace('-', '')}-${payment.id.slice(-5).toUpperCase()}`],
    ['Date paid', formatDate(payment.paidAt || payment.createdAt)],
    ['Tenant', payment.tenantName],
    ['House / unit', payment.unit],
    ['Rent period', formatMonth(payment.month)],
    ['Payment method', payment.method || 'M-Pesa']
  ];

  if (payment.mpesaReceipt) {
    fields.push(['M-Pesa code', payment.mpesaReceipt]);
  }
  if (payment.payerPhone) {
    fields.push(['Paid from', formatPhone(payment.payerPhone)]);
  }

  doc.setFontSize(10);
  fields.forEach(([label, value]) => {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(label, startX, currentY);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(String(value), endX, currentY, { align: 'right' });
    currentY += 8;
  });

  // Footer divider
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(startX, currentY, endX, currentY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text('Thank you for your payment. Keep this receipt for your records.', startX, currentY + 7);
  doc.text(`Generated on ${formatDate(Date.now())}`, startX, currentY + 12);

  const filename = (payment.receiptNo || 'Receipt') + '.pdf';
  doc.save(filename);
}

export async function generateStatementPDF(tenant, statementData, startMonth, endMonth, propertyName = 'Rent Portal') {
  if (typeof window.jspdf === 'undefined') {
    window.print();
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const startX = 14;
  const endX = 196;
  let currentY = 18;

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text(propertyName || 'Rent Portal', startX, currentY);
  currentY += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(100, 116, 139);
  doc.text(`Tenant statement: ${formatMonth(startMonth)} to ${formatMonth(endMonth)}`, startX, currentY);
  currentY += 4;

  doc.setDrawColor(5, 150, 105);
  doc.setLineWidth(0.6);
  doc.line(startX, currentY, endX, currentY);
  currentY += 8;

  // Tenant Details
  doc.setFontSize(10);
  const details = [
    ['Tenant', tenant.name],
    ['House / unit', tenant.unit],
    ['Phone', formatPhone(tenant.phone)],
    ['Email', tenant.email || '-'],
    ['Generated', formatDate(Date.now())]
  ];

  details.forEach(([lbl, val]) => {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(lbl, startX, currentY);
    doc.setTextColor(15, 23, 42);
    doc.text(val || '-', startX + 32, currentY);
    currentY += 6;
  });
  currentY += 4;

  // 4 Summary Boxes
  const formatBalance = (bal) => (bal < 0 ? `${formatKES(-bal)} CR` : formatKES(bal));
  const summaryBoxes = [
    ['Opening balance', formatBalance(statementData.opening)],
    ['Rent charged', formatKES(statementData.charged)],
    ['Payments received', formatKES(statementData.paid)],
    ['Closing balance', formatBalance(statementData.closing)]
  ];

  const colWidth = (endX - startX) / 4;
  summaryBoxes.forEach(([lbl, val], idx) => {
    const colX = startX + idx * colWidth;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(lbl, colX, currentY);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(val, colX, currentY + 6);
  });
  currentY += 16;

  // Table Header
  const renderTableHeader = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text('Date', startX, currentY);
    doc.text('Description', startX + 26, currentY);
    doc.text('Charged', 140, currentY, { align: 'right' });
    doc.text('Paid', 168, currentY, { align: 'right' });
    doc.text('Balance', endX, currentY, { align: 'right' });
    currentY += 2;
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.line(startX, currentY, endX, currentY);
    currentY += 5;
  };

  renderTableHeader();

  const printRow = (date, desc, charged, paid, balance) => {
    if (currentY > 280) {
      doc.addPage();
      currentY = 18;
      renderTableHeader();
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(String(date), startX, currentY);
    const shortDesc = doc.splitTextToSize(desc, 80)[0] || '';
    doc.text(shortDesc, startX + 26, currentY);
    doc.text(charged ? formatKES(charged) : '', 140, currentY, { align: 'right' });
    doc.text(paid ? formatKES(paid) : '', 168, currentY, { align: 'right' });
    doc.text(formatBalance(balance), endX, currentY, { align: 'right' });
    currentY += 6;
  };

  // Opening Balance Line
  printRow(formatDate(new Date(startMonth + '-01')), 'Opening balance', '', '', statementData.opening);

  // Line items
  statementData.lines.forEach((line) => {
    printRow(line.date, line.description, line.charged, line.paid, line.balance);
  });

  currentY += 2;
  doc.setDrawColor(203, 213, 225);
  doc.line(startX, currentY, endX, currentY);
  currentY += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Closing balance', startX, currentY);
  doc.text(formatBalance(statementData.closing), endX, currentY, { align: 'right' });
  currentY += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text('Charges are monthly rent bills issued on the 1st of each month. CR means tenant is in credit.', startX, currentY);

  const cleanUnit = tenant.unit.replace(/[^A-Za-z0-9]/g, '') || 'tenant';
  doc.save(`statement-${cleanUnit}-${startMonth}-to-${endMonth}.pdf`);
}
