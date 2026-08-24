import { describe, it, expect } from 'vitest';
import { toGatewayPayload, fromGatewayView, hasWhitelistTag, WHITELIST_TAG_HEADER } from './ip-filter-action-map';

describe('toGatewayPayload (canonical action → gateway payload)', () => {
  it('keeps canonical blacklist actions', () => {
    expect(toGatewayPayload('reject')).toEqual({ action: 'reject' });
    expect(toGatewayPayload('quarantine')).toEqual({ action: 'quarantine' });
    expect(toGatewayPayload('discard')).toEqual({ action: 'discard' });
    expect(toGatewayPayload('audit')).toEqual({ action: 'audit' });
  });

  it('keeps whitelist accept', () => {
    expect(toGatewayPayload('accept')).toEqual({ action: 'accept' });
  });

  it('adds the whitelist tag without changing the action', () => {
    expect(toGatewayPayload('accept', true)).toEqual({
      action: 'accept',
      add_headers: [WHITELIST_TAG_HEADER],
    });
  });
});

describe('fromGatewayView (gateway action → demo action)', () => {
  it('maps blacklist actions back', () => {
    expect(fromGatewayView('reject', [], 'blacklist')).toBe('reject');
    expect(fromGatewayView('quarantine', [], 'blacklist')).toBe('quarantine');
    expect(fromGatewayView('discard', [], 'blacklist')).toBe('discard');
    expect(fromGatewayView('audit', [], 'blacklist')).toBe('audit');
  });

  it('keeps accept canonical and reads tagging separately', () => {
    expect(fromGatewayView('accept', [], 'whitelist')).toBe('accept');
    expect(fromGatewayView('accept', [WHITELIST_TAG_HEADER], 'whitelist')).toBe('accept');
    expect(hasWhitelistTag([{ key: 'x-whitelist', value: 'yes' }])).toBe(true);
  });

  it('degrades sideline to review', () => {
    expect(fromGatewayView('sideline', [], 'blacklist')).toBe('audit');
  });

  it('round-trips all demo actions', () => {
    const cases: Array<['blacklist' | 'whitelist', ReturnType<typeof fromGatewayView>]> = [
      ['blacklist', 'reject'],
      ['blacklist', 'quarantine'],
      ['blacklist', 'discard'],
      ['blacklist', 'audit'],
      ['whitelist', 'accept'],
    ];
    for (const [listType, demo] of cases) {
      const p = toGatewayPayload(demo);
      expect(fromGatewayView(p.action, p.add_headers, listType)).toBe(demo);
    }
  });
});
