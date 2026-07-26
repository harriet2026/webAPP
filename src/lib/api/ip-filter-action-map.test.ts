import { describe, it, expect } from 'vitest';
import { toGatewayPayload, fromGatewayView, WHITELIST_TAG_HEADER } from './ip-filter-action-map';

describe('toGatewayPayload (demo action → gateway payload)', () => {
  it('maps blacklist actions', () => {
    expect(toGatewayPayload('block')).toEqual({ action: 'reject' });
    expect(toGatewayPayload('quarantine')).toEqual({ action: 'quarantine' });
    expect(toGatewayPayload('drop')).toEqual({ action: 'discard' });
    expect(toGatewayPayload('review')).toEqual({ action: 'audit' });
  });

  it('maps whitelist deliver to accept', () => {
    expect(toGatewayPayload('deliver')).toEqual({ action: 'accept' });
  });

  it('maps tagDeliver to accept + X-Whitelist header', () => {
    expect(toGatewayPayload('tagDeliver')).toEqual({
      action: 'accept',
      add_headers: [WHITELIST_TAG_HEADER],
    });
  });
});

describe('fromGatewayView (gateway action → demo action)', () => {
  it('maps blacklist actions back', () => {
    expect(fromGatewayView('reject', [], 'blacklist')).toBe('block');
    expect(fromGatewayView('quarantine', [], 'blacklist')).toBe('quarantine');
    expect(fromGatewayView('discard', [], 'blacklist')).toBe('drop');
    expect(fromGatewayView('audit', [], 'blacklist')).toBe('review');
  });

  it('distinguishes deliver vs tagDeliver by header', () => {
    expect(fromGatewayView('accept', [], 'whitelist')).toBe('deliver');
    expect(fromGatewayView('accept', [WHITELIST_TAG_HEADER], 'whitelist')).toBe('tagDeliver');
    expect(fromGatewayView('accept', [{ key: 'x-whitelist', value: 'yes' }], 'whitelist')).toBe('tagDeliver');
  });

  it('degrades sideline to review', () => {
    expect(fromGatewayView('sideline', [], 'blacklist')).toBe('review');
  });

  it('round-trips all demo actions', () => {
    const cases: Array<['blacklist' | 'whitelist', ReturnType<typeof fromGatewayView>]> = [
      ['blacklist', 'block'],
      ['blacklist', 'quarantine'],
      ['blacklist', 'drop'],
      ['blacklist', 'review'],
      ['whitelist', 'deliver'],
      ['whitelist', 'tagDeliver'],
    ];
    for (const [listType, demo] of cases) {
      const p = toGatewayPayload(demo);
      expect(fromGatewayView(p.action, p.add_headers, listType)).toBe(demo);
    }
  });
});
