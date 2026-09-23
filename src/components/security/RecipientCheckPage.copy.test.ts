import { describe, expect, it } from 'vitest';
import zh from '@/../messages/zh.json';
import en from '@/../messages/en.json';
import th from '@/../messages/th.json';
import ru from '@/../messages/ru.json';

describe('recipient limit action copy (GT-14076)', () => {
  it('states the exact SMTP reply and per-recipient scope in Chinese', () => {
    const descriptions = zh.recipientCheck.limit.actionDesc;

    expect(descriptions.reject).toContain('552 5.5.3');
    expect(descriptions.reject).toContain('仅超限收件人');
    expect(descriptions.reject).not.toContain('452/550');
    expect(descriptions.quarantine).toContain('仅超限收件人');
    expect(descriptions.audit).toContain('仅超限收件人');
    expect(descriptions.discard).toContain('仅超限收件人');
  });

  it.each([zh, en, th, ru])('does not advertise the obsolete 452/550 reply', (messages) => {
    const reject = messages.recipientCheck.limit.actionDesc.reject;
    expect(reject).toContain('552');
    expect(reject).not.toContain('452/550');
  });
});

describe('recipient existence action copy (GT-14139)', () => {
  it('describes failed existence verification without recipient-limit terminology in Chinese', () => {
    const descriptions = zh.recipientCheck.existence.actionDesc;

    for (const description of Object.values(descriptions)) {
      expect(description).toContain('收件人不存在或验证失败时');
      expect(description).not.toContain('阈值');
      expect(description).not.toContain('超限');
    }
  });

  it.each([zh, en, th, ru])('keeps existence and recipient-limit descriptions independent', (messages) => {
    const existenceDescriptions = messages.recipientCheck.existence.actionDesc;
    const limitDescriptions = messages.recipientCheck.limit.actionDesc;

    expect(Object.keys(existenceDescriptions).sort()).toEqual(['audit', 'discard', 'quarantine', 'reject']);
    for (const action of Object.keys(existenceDescriptions) as Array<keyof typeof existenceDescriptions>) {
      expect(existenceDescriptions[action]).not.toBe(limitDescriptions[action]);
    }
  });
});
