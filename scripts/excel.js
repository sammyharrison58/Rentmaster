// excel.js - Excel SheetJS Export for Rent Collection Reports

import { formatDate, formatMonth } from './store.js';

export async function exportYearlyReportXLSX(year, tenants, payments, propertyName = 'Rent Portal') {
  if (typeof window.XLSX === 'undefined') {
    alert('Excel exporter library loading. Please try again in a moment.');
    return;
  }

  const XLSX = window.XLSX;
  const wb = XLSX.utils.book_new();
  const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthsFull = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const reportTitle = `${propertyName ? propertyName + ' - ' : ''}Rent collection report ${year}`;

  // 1. Build Yearly Summary Matrix
  const unitMap = new Map();
  tenants
    .filter((t) => t.status === 'approved' || t.status === 'suspended')
    .forEach((t) => {
      unitMap.set(t.userId, {
        unit: t.unit,
        tenant: t.name,
        rent: t.monthlyRent || 0,
        months: new Array(12).fill(0),
        total: 0
      });
    });

  const yearStr = String(year);
  const confirmedPayments = payments.filter(
    (p) => p.status === 'confirmed' && p.month && p.month.startsWith(yearStr)
  );

  confirmedPayments.forEach((p) => {
    let row = unitMap.get(p.tenantId);
    if (!row) {
      row = {
        unit: p.unit || 'Unknown',
        tenant: p.tenantName || 'Unknown',
        rent: 0,
        months: new Array(12).fill(0),
        total: 0
      };
      unitMap.set(p.tenantId || Math.random().toString(), row);
    }
    const monthIdx = Number(p.month.slice(5, 7)) - 1;
    if (monthIdx >= 0 && monthIdx < 12) {
      row.months[monthIdx] += p.amount;
      row.total += p.amount;
    }
  });

  const rows = [...unitMap.values()].sort((a, b) =>
    a.unit.localeCompare(b.unit, undefined, { numeric: true })
  );

  const monthTotals = monthsShort.map((_, i) => rows.reduce((sum, r) => sum + r.months[i], 0));
  const grandTotal = monthTotals.reduce((sum, val) => sum + val, 0);

  const sheet1Data = [
    [reportTitle],
    ['Gross rent received from confirmed payments (KES), by rent month'],
    [],
    ['House / unit', 'Tenant', ...monthsShort, 'Total']
  ];

  rows.forEach((r) => {
    sheet1Data.push([r.unit, r.tenant, ...r.months, r.total]);
  });
  sheet1Data.push(['Total', '', ...monthTotals, grandTotal]);

  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);
  ws1['!cols'] = [{ wch: 14 }, { wch: 24 }, ...monthsShort.map(() => ({ wch: 10 })), { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Yearly summary');

  // 2. Build Monthly Detail Sheet
  const sheet2Data = [
    [reportTitle],
    ['Rent due, paid and balance per unit for each month (KES)'],
    [],
    ['Month', 'House / unit', 'Tenant', 'Rent due', 'Paid', 'Balance']
  ];

  monthsFull.forEach((mName, mIdx) => {
    const monthCode = `${year}-${String(mIdx + 1).padStart(2, '0')}`;
    let mDueTotal = 0;
    let mPaidTotal = 0;

    rows.forEach((r) => {
      const due = r.rent;
      const paid = r.months[mIdx];
      const bal = Math.max(due - paid, 0);
      if (due > 0 || paid > 0) {
        mDueTotal += due;
        mPaidTotal += paid;
        sheet2Data.push([`${mName} ${year}`, r.unit, r.tenant, due, paid, bal]);
      }
    });

    sheet2Data.push([`${mName} ${year} Total`, '', '', mDueTotal, mPaidTotal, Math.max(mDueTotal - mPaidTotal, 0)]);
    sheet2Data.push([]);
  });

  const ws2 = XLSX.utils.aoa_to_sheet(sheet2Data);
  ws2['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 24 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Monthly detail');

  // 3. Build Payments Ledger Sheet
  const sheet3Data = [
    ['Date paid', 'Receipt no', 'M-Pesa code / reference', 'House / unit', 'Tenant', 'Rent month', 'Method', 'Amount (KES)']
  ];

  [...confirmedPayments]
    .sort((a, b) => (a.paidAt || a.createdAt) - (b.paidAt || b.createdAt))
    .forEach((p) => {
      sheet3Data.push([
        formatDate(p.paidAt || p.createdAt),
        p.receiptNo || '-',
        p.mpesaReceipt || p.reference || '-',
        p.unit,
        p.tenantName,
        formatMonth(p.month),
        p.method,
        p.amount
      ]);
    });
  sheet3Data.push(['', '', '', '', '', '', 'Total', grandTotal]);

  const ws3 = XLSX.utils.aoa_to_sheet(sheet3Data);
  ws3['!cols'] = [{ wch: 14 }, { wch: 18 }, { wch: 20 }, { wch: 14 }, { wch: 24 }, { wch: 16 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws3, 'Payments');

  XLSX.writeFile(wb, `rent-collection-${year}.xlsx`);
}
