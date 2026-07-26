import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { AuthFlowDiagram } from './AuthFlowDiagram';
import zh from '@/../messages/zh.json';

const wrap = (ui: React.ReactNode) =>
  <NextIntlClientProvider locale="zh" messages={zh as any}>{ui}</NextIntlClientProvider>;

describe('AuthFlowDiagram', () => {
  const base = { spf:'reject', dkim:'quarantine', dmarc:'reject', ptr:'quarantine' } as const;
  it('renders 6 nodes incl. pipeline & next endpoints', () => {
    render(wrap(<AuthFlowDiagram failActions={base} activeTab="spf" onNodeClick={()=>{}} />));
    expect(screen.getByText('策略流水线')).toBeTruthy();
    expect(screen.getByText('下一模块')).toBeTruthy();
    ['SPF','DKIM','DMARC','PTR'].forEach(l => expect(screen.getByText(l)).toBeTruthy());
  });
  it('clicking a protocol node calls onNodeClick; endpoints do not', () => {
    const cb = vi.fn();
    render(wrap(<AuthFlowDiagram failActions={base} activeTab="spf" onNodeClick={cb} />));
    fireEvent.click(screen.getByText('DKIM'));
    expect(cb).toHaveBeenCalledWith('dkim');
    fireEvent.click(screen.getByText('下一模块'));
    expect(cb).toHaveBeenCalledTimes(1);
  });
  it('discard fail action shows 丢弃 sub-label', () => {
    render(wrap(<AuthFlowDiagram failActions={{...base, spf:'discard'}} activeTab="spf" onNodeClick={()=>{}} />));
    expect(screen.getAllByText('丢弃').length).toBeGreaterThan(0);
  });
});
