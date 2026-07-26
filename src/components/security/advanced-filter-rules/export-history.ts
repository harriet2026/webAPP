// export-history.ts — CSV + "print to PDF" export helpers for the layer-5
// 测试与分析 Tab's 历史版本 table (layer-5-test-analysis.html "历史版本"
// section: "导出按钮 PDF / CSV").
//
// PDF export deliberately does NOT pull in a PDF-generation library
// (jsPDF etc.): this repo pins no PDF dep, node_modules here has version
// drift, and embedding CJK/Thai/Cyrillic fonts in jsPDF is multi-MB and
// blocking. Instead openPrintView opens a self-contained print-friendly HTML
// document in a new window/tab and calls window.print() — the browser's
// native "another way to render this data" — so the user picks "另存为 PDF"
// from the OS print dialog. System fonts render all four locales (zh/en/
// th/ru) correctly for free, and there is zero new dependency.

export interface HistoryRow {
  versionNo: number;
  changedAt: string;
  changedBy: string;
  changeSummary: string; // already-localized display text, not the raw "basic,conditions" wire value
}

export interface HistoryCsvLabels {
  version: string;
  changedAt: string;
  changedBy: string;
  changeSummary: string;
}

// escapeCsvField quotes a field when it contains a comma, quote, or newline
// (RFC 4180), doubling any embedded quotes.
function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// buildHistoryCsv renders the version-history table to a CSV string
// (CRLF row separators per RFC 4180). Pure and side-effect free so it is
// unit-testable without touching the DOM.
export function buildHistoryCsv(rows: HistoryRow[], labels: HistoryCsvLabels): string {
  const header = [labels.version, labels.changedAt, labels.changedBy, labels.changeSummary]
    .map(escapeCsvField)
    .join(',');
  const lines = rows.map((r) =>
    [`v${r.versionNo}`, r.changedAt, r.changedBy, r.changeSummary].map(escapeCsvField).join(','),
  );
  return [header, ...lines].join('\r\n');
}

// downloadCsv triggers a browser download of `csv` as `filename` via a
// throwaway Blob URL + <a download>. A UTF-8 BOM is prepended so Excel
// (which otherwise guesses a locale codepage and mangles zh/th/ru text)
// opens the file as UTF-8.
export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface PrintViewLabels extends HistoryCsvLabels {
  title: string;
}

// WindowOpener mirrors the subset of `window.open` openPrintView needs, so
// tests can inject a fake window-like object instead of relying on jsdom's
// (unimplemented) print support.
export type WindowOpener = (url?: string, target?: string) => PrintableWindow | null;

export interface PrintableWindow {
  document: { write: (html: string) => void; close: () => void };
  focus: () => void;
  print: () => void;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// openPrintView opens a new window/tab containing a minimal, self-contained
// print-friendly rendering of the version-history table and invokes
// window.print() on it. The caller's "导出 PDF" button wires to this; the
// resulting system print dialog lets the user "另存为 PDF".
export function openPrintView(
  rows: HistoryRow[],
  labels: PrintViewLabels,
  opener: WindowOpener = (url, target) => window.open(url, target),
): void {
  const win = opener('', '_blank');
  if (!win) return;

  const rowsHtml = rows
    .map(
      (r) =>
        `<tr><td>v${r.versionNo}</td><td>${escapeHtml(r.changedAt)}</td><td>${escapeHtml(r.changedBy)}</td><td>${escapeHtml(r.changeSummary)}</td></tr>`,
    )
    .join('');

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(labels.title)}</title>
<style>
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; padding: 24px; color: #111; }
  h1 { font-size: 16px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #d1d5db; padding: 6px 10px; text-align: left; }
  th { background: #f3f4f6; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
<h1>${escapeHtml(labels.title)}</h1>
<table>
<thead><tr><th>${escapeHtml(labels.version)}</th><th>${escapeHtml(labels.changedAt)}</th><th>${escapeHtml(labels.changedBy)}</th><th>${escapeHtml(labels.changeSummary)}</th></tr></thead>
<tbody>${rowsHtml}</tbody>
</table>
</body>
</html>`;

  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}
