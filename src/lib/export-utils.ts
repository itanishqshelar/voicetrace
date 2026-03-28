import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { SaleEntry } from './supabase';

// ──────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────

function flattenEntries(entries: SaleEntry[]) {
  const rows: {
    date: string;
    name: string;
    qty: number;
    price: number;
    total: number;
    type: string;
    category: string;
  }[] = [];

  entries.forEach((entry) => {
    (entry.items || []).forEach((item) => {
      rows.push({
        date: entry.date,
        name: item.name,
        qty: item.qty,
        price: item.price,
        total: item.total,
        type: item.type === 'expense' ? 'Expense' : 'Sale',
        category: item.category || '-',
      });
    });
  });

  return rows;
}

function computeSummary(entries: SaleEntry[]) {
  const allItems = entries.flatMap((e) => e.items || []);
  const sales = allItems.filter((i) => i.type !== 'expense');
  const expenses = allItems.filter((i) => i.type === 'expense');

  const totalRevenue = sales.reduce((s, i) => s + i.total, 0);
  const totalExpenses = expenses.reduce((s, i) => s + i.total, 0);
  const netEarnings = totalRevenue - totalExpenses;
  const totalItemsSold = sales.reduce((s, i) => s + i.qty, 0);

  // Top item
  const itemMap = new Map<string, number>();
  sales.forEach((item) => {
    itemMap.set(item.name, (itemMap.get(item.name) || 0) + item.qty);
  });
  const topItem = Array.from(itemMap.entries()).sort((a, b) => b[1] - a[1])[0];

  // Date range
  const dates = entries.map((e) => e.date).sort();
  const from = dates[0] || '-';
  const to = dates[dates.length - 1] || '-';

  return { totalRevenue, totalExpenses, netEarnings, totalItemsSold, topItem, from, to };
}

// ──────────────────────────────────────────
// PDF Export
// ──────────────────────────────────────────

export function exportPDF(entries: SaleEntry[]) {
  const summary = computeSummary(entries);
  const rows = flattenEntries(entries);
  const doc = new jsPDF();

  const pageWidth = doc.internal.pageSize.getWidth();

  // Header bar
  doc.setFillColor(79, 70, 229); // indigo-600
  doc.rect(0, 0, pageWidth, 36, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('VoiceTrace', 14, 16);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Business Summary Report', 14, 24);
  doc.setFontSize(9);
  doc.text(`Period: ${summary.from} to ${summary.to}`, 14, 31);
  doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, pageWidth - 14, 31, { align: 'right' });

  // Summary Cards
  doc.setTextColor(30, 41, 59); // slate-800
  let y = 48;

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Summary Overview', 14, y);
  y += 10;

  // Draw summary boxes
  const boxW = (pageWidth - 28 - 15) / 4;
  const summaryData = [
    { label: 'Total Sales', value: `₹${summary.totalRevenue.toLocaleString('en-IN')}`, color: [16, 185, 129] },
    { label: 'Total Expenses', value: `₹${summary.totalExpenses.toLocaleString('en-IN')}`, color: [239, 68, 68] },
    { label: 'Net Earnings', value: `₹${summary.netEarnings.toLocaleString('en-IN')}`, color: [79, 70, 229] },
    { label: 'Items Sold', value: summary.totalItemsSold.toString(), color: [245, 158, 11] },
  ];

  summaryData.forEach((card, i) => {
    const x = 14 + i * (boxW + 5);
    doc.setFillColor(card.color[0], card.color[1], card.color[2]);
    doc.roundedRect(x, y, boxW, 28, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(card.label, x + 6, y + 10);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(card.value, x + 6, y + 22);
  });

  y += 38;

  // Top item
  if (summary.topItem) {
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`⭐ Top Selling Item: ${summary.topItem[0]} (${summary.topItem[1]} units)`, 14, y);
    y += 12;
  }

  // Detailed table
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Detailed Transactions', 14, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    head: [['Date', 'Item', 'Qty', 'Price (₹)', 'Total (₹)', 'Type']],
    body: rows.map((r) => [r.date, r.name, r.qty.toString(), r.price.toString(), r.total.toString(), r.type]),
    headStyles: {
      fillColor: [79, 70, 229],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: { fontSize: 8.5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    styles: { cellPadding: 3 },
    margin: { left: 14, right: 14 },
  });

  // Footer
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const pgH = doc.internal.pageSize.getHeight();
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth / 2, pgH - 8, { align: 'center' });
    doc.text('VoiceTrace · Built for street vendors', 14, pgH - 8);
  }

  doc.save(`VoiceTrace_Report_${new Date().toISOString().split('T')[0]}.pdf`);
}

// ──────────────────────────────────────────
// Excel Export
// ──────────────────────────────────────────

export function exportExcel(entries: SaleEntry[]) {
  const summary = computeSummary(entries);
  const rows = flattenEntries(entries);

  const wb = XLSX.utils.book_new();

  // Sheet 1 — Summary
  const summaryRows = [
    ['VoiceTrace — Business Summary'],
    [`Generated: ${new Date().toLocaleDateString('en-IN')}`],
    [`Period: ${summary.from} to ${summary.to}`],
    [],
    ['Metric', 'Value'],
    ['Total Sales', summary.totalRevenue],
    ['Total Expenses', summary.totalExpenses],
    ['Net Earnings', summary.netEarnings],
    ['Items Sold', summary.totalItemsSold],
    ['Top Item', summary.topItem ? `${summary.topItem[0]} (${summary.topItem[1]} units)` : '-'],
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  summarySheet['!cols'] = [{ wch: 20 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

  // Sheet 2 — Transactions
  const txHeader = ['Date', 'Item', 'Qty', 'Price (₹)', 'Total (₹)', 'Type', 'Category'];
  const txData = rows.map((r) => [r.date, r.name, r.qty, r.price, r.total, r.type, r.category]);
  const txSheet = XLSX.utils.aoa_to_sheet([txHeader, ...txData]);
  txSheet['!cols'] = [
    { wch: 12 }, { wch: 18 }, { wch: 6 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, txSheet, 'Transactions');

  // Sheet 3 — Daily Summary
  const dailyMap = new Map<string, { sales: number; expenses: number }>();
  entries.forEach((e) => {
    const existing = dailyMap.get(e.date) || { sales: 0, expenses: 0 };
    (e.items || []).forEach((item) => {
      if (item.type === 'expense') existing.expenses += item.total;
      else existing.sales += item.total;
    });
    dailyMap.set(e.date, existing);
  });
  const dailyHeader = ['Date', 'Sales (₹)', 'Expenses (₹)', 'Net (₹)'];
  const dailyData = Array.from(dailyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, val]) => [date, val.sales, val.expenses, val.sales - val.expenses]);
  const dailySheet = XLSX.utils.aoa_to_sheet([dailyHeader, ...dailyData]);
  dailySheet['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, dailySheet, 'Daily Summary');

  XLSX.writeFile(wb, `VoiceTrace_Data_${new Date().toISOString().split('T')[0]}.xlsx`);
}
