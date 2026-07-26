import { describe, expect, it, vi } from 'vitest';
import { buildHistoryCsv, openPrintView, type HistoryRow, type PrintableWindow } from './export-history';

const LABELS = { version: '版本', changedAt: '修改时间', changedBy: '修改人', changeSummary: '修改内容' };

const ROWS: HistoryRow[] = [
  { versionNo: 3, changedAt: '2025-01-15 14:30', changedBy: 'admin', changeSummary: '新增条件' },
  { versionNo: 2, changedAt: '2025-01-10 09:15', changedBy: 'admin', changeSummary: '修改动作' },
  { versionNo: 1, changedAt: '2025-01-05 08:00', changedBy: 'admin', changeSummary: '创建' },
];

describe('buildHistoryCsv', () => {
  it('emits a header row followed by one row per version, CRLF-joined', () => {
    const csv = buildHistoryCsv(ROWS, LABELS);
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe('版本,修改时间,修改人,修改内容');
    expect(lines[1]).toBe('v3,2025-01-15 14:30,admin,新增条件');
    expect(lines[2]).toBe('v2,2025-01-10 09:15,admin,修改动作');
    expect(lines[3]).toBe('v1,2025-01-05 08:00,admin,创建');
  });

  it('prefixes the version number with "v"', () => {
    const csv = buildHistoryCsv([{ versionNo: 42, changedAt: 't', changedBy: 'u', changeSummary: 's' }], LABELS);
    expect(csv.split('\r\n')[1].startsWith('v42,')).toBe(true);
  });

  it('quotes and escapes a change-summary field containing a comma', () => {
    const csv = buildHistoryCsv(
      [{ versionNo: 4, changedAt: 't', changedBy: 'u', changeSummary: '基础设置、条件' }],
      LABELS,
    );
    // No comma in this fixture; use one that actually has a comma to hit the quoting path.
    const csv2 = buildHistoryCsv(
      [{ versionNo: 4, changedAt: 't', changedBy: 'u', changeSummary: 'basic,conditions' }],
      LABELS,
    );
    expect(csv).toContain('基础设置、条件');
    expect(csv2.split('\r\n')[1]).toBe('v4,t,u,"basic,conditions"');
  });

  it('escapes an embedded double quote by doubling it', () => {
    const csv = buildHistoryCsv([{ versionNo: 1, changedAt: 't', changedBy: 'u', changeSummary: 'say "hi"' }], LABELS);
    expect(csv.split('\r\n')[1]).toBe('v1,t,u,"say ""hi"""');
  });

  it('returns just the header row for an empty version list', () => {
    const csv = buildHistoryCsv([], LABELS);
    expect(csv).toBe('版本,修改时间,修改人,修改内容');
  });
});

describe('openPrintView', () => {
  function fakeWindow(): PrintableWindow & { writeCalls: string[]; printCalls: number; focusCalls: number } {
    const writeCalls: string[] = [];
    let printCalls = 0;
    let focusCalls = 0;
    return {
      writeCalls,
      get printCalls() {
        return printCalls;
      },
      get focusCalls() {
        return focusCalls;
      },
      document: {
        write: (html: string) => writeCalls.push(html),
        close: vi.fn(),
      },
      focus: () => {
        focusCalls += 1;
      },
      print: () => {
        printCalls += 1;
      },
    } as unknown as PrintableWindow & { writeCalls: string[]; printCalls: number; focusCalls: number };
  }

  it('writes an HTML document containing every row and calls print()', () => {
    const win = fakeWindow();
    const opener = vi.fn(() => win);

    openPrintView(ROWS, { ...LABELS, title: '规则历史版本' }, opener);

    expect(opener).toHaveBeenCalledWith('', '_blank');
    expect(win.writeCalls).toHaveLength(1);
    const html = win.writeCalls[0];
    expect(html).toContain('规则历史版本');
    expect(html).toContain('v3');
    expect(html).toContain('新增条件');
    expect(html).toContain('v1');
    expect(win.printCalls).toBe(1);
    expect(win.focusCalls).toBe(1);
  });

  it('HTML-escapes row content so a stray "<" cannot break the document', () => {
    const win = fakeWindow();
    openPrintView(
      [{ versionNo: 1, changedAt: 't', changedBy: 'u', changeSummary: '<script>alert(1)</script>' }],
      { ...LABELS, title: 't' },
      () => win,
    );
    expect(win.writeCalls[0]).not.toContain('<script>alert');
    expect(win.writeCalls[0]).toContain('&lt;script&gt;');
  });

  it('does nothing (no throw) when the opener returns null (popup blocked)', () => {
    expect(() => openPrintView(ROWS, { ...LABELS, title: 't' }, () => null)).not.toThrow();
  });
});
