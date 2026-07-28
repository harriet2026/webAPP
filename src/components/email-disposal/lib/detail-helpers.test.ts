import { describe, expect, test } from 'vitest';
import {
  mailTypeTone, mailTypeConfig, correctionSourceLabelKey, recipientActionsForStatus, derivePhishAgentThreatLevel,
  isNewSender, mailTypeLabelKey, deriveIntentLabels, deriveConfidence, deriveHitSource, deriveDomainName,
  isSensitiveUrgent, RECLASSIFY_TYPE_ORDER,
} from './detail-helpers';
import type { MailLogDetail } from '@/types/email-disposal-detail';
import zhMessages from '../../../../messages/zh.json';
import enMessages from '../../../../messages/en.json';
import thMessages from '../../../../messages/th.json';
import ruMessages from '../../../../messages/ru.json';
import type { EmailType } from '@/types/email-disposal-detail';

describe('deriveIntentLabels', () => {
  test.each([
    ['Non-Spam', 'nonSpam'],
    ['Normal-Spam', 'spam'],
    ['Subscription', 'subscription'],
    ['PornGambling', 'pornGambling'],
    ['Political', 'political'],
    ['Virus', 'virus'],
    ['Phishing', 'phishing'],
  ])('maps CAC tag %s to stable translation key %s', (tag, key) => {
    expect(deriveIntentLabels({ tag })).toEqual([key]);
  });

  test('keeps an unknown CAC tag as displayable fallback text', () => {
    expect(deriveIntentLabels({ tag: 'Future-CAC-Tag' })).toEqual(['Future-CAC-Tag']);
  });

  test('every canonical CAC key exists in all supported locale messages', () => {
    const messages = [zhMessages, enMessages, thMessages, ruMessages];
    for (const tag of ['Non-Spam', 'Normal-Spam', 'Subscription', 'PornGambling', 'Political', 'Virus', 'Phishing']) {
      const [key] = deriveIntentLabels({ tag });
      for (const localeMessages of messages) {
        const intent = (localeMessages as { emailDisposal: { detail: { overview: { intent: Record<string, string> } } } })
          .emailDisposal.detail.overview.intent;
        expect(intent[key], `missing intent label for CAC tag=${tag} (key=${key})`).toBeTruthy();
      }
    }
  });
});

describe('mailTypeLabelKey', () => {
  // Regression for the list-column bug: the backend email_type is snake_case
  // but the message keys are camelCase, so string interpolation broke multi-word
  // types like account_compromised.
  test('maps snake_case account_compromised to the camelCase message key', () => {
    expect(mailTypeLabelKey('account_compromised')).toBe('detail.mailType.accountCompromised');
  });

  test('every EmailType resolves to a key that exists in messages/zh.json', () => {
    const detail = (zhMessages as { emailDisposal: { detail: { mailType: Record<string, string> } } })
      .emailDisposal.detail.mailType;
    for (const t of Object.keys(mailTypeConfig) as EmailType[]) {
      const key = mailTypeLabelKey(t).replace('detail.mailType.', '');
      expect(detail[key], `missing zh label for email_type=${t} (key=${key})`).toBeTruthy();
    }
  });

  test('unknown type falls back to interpolated key', () => {
    expect(mailTypeLabelKey('made_up')).toBe('detail.mailType.made_up');
    expect(mailTypeLabelKey(undefined)).toBe('detail.mailType.undefined');
  });
});

describe('correctionSourceLabelKey', () => {
  // Regression for the tooltip showing the raw token: each source maps to a
  // detail.correctionSource.* key present in messages.
  test.each([
    ['admin_release', 'detail.correctionSource.adminRelease'],
    ['admin_recall', 'detail.correctionSource.adminRecall'],
    ['user_retrieval', 'detail.correctionSource.userRetrieval'],
    [undefined, 'detail.correctionSource.unknown'],
  ] as const)('%s -> %s', (src, want) => {
    expect(correctionSourceLabelKey(src)).toBe(want);
  });

  test('every source key exists in messages/zh.json', () => {
    const cs = (zhMessages as { emailDisposal: { detail: { correctionSource: Record<string, string> } } })
      .emailDisposal.detail.correctionSource;
    for (const src of ['admin_release', 'admin_recall', 'user_retrieval', undefined]) {
      const key = correctionSourceLabelKey(src).replace('detail.correctionSource.', '');
      expect(cs[key], `missing zh label for correction_source=${src}`).toBeTruthy();
    }
  });
});

describe('mailTypeTone', () => {
  const malicious: EmailType[] = ['phishing', 'virus', 'account_compromised', 'spoofing', 'harmful'];
  const graymail: EmailType[] = ['spam', 'advertising', 'suspicious', 'sensitive'];
  const normal: EmailType[] = ['normal', 'subscription'];

  test.each(malicious)('%s is malicious-toned', (t) => expect(mailTypeTone(t)).toBe('malicious'));
  test.each(graymail)('%s is graymail-toned', (t) => expect(mailTypeTone(t)).toBe('graymail'));
  test.each(normal)('%s is normal-toned', (t) => expect(mailTypeTone(t)).toBe('normal'));

  test('every EmailType key has a mailTypeConfig entry', () => {
    const all: EmailType[] = [...malicious, ...graymail, ...normal];
    expect(Object.keys(mailTypeConfig).sort()).toEqual(all.sort());
  });

  test('className matches tone for every type (not just the tone field)', () => {
    for (const t of malicious) {
      expect(mailTypeConfig[t].className).toContain('red');
    }
    for (const t of graymail) {
      expect(mailTypeConfig[t].className).toContain('amber');
    }
    for (const t of normal) {
      expect(mailTypeConfig[t].className).toContain('emerald');
    }
  });
});

describe('correctionSourceLabelKey', () => {
  test('maps known sources', () => {
    expect(correctionSourceLabelKey('admin_release')).toBe('detail.correctionSource.adminRelease');
    expect(correctionSourceLabelKey('admin_recall')).toBe('detail.correctionSource.adminRecall');
    expect(correctionSourceLabelKey('user_retrieval')).toBe('detail.correctionSource.userRetrieval');
  });
  test('falls back for unknown/undefined source', () => {
    expect(correctionSourceLabelKey(undefined)).toBe('detail.correctionSource.unknown');
    expect(correctionSourceLabelKey('bogus')).toBe('detail.correctionSource.unknown');
  });
});

describe('recipientActionsForStatus', () => {
  // 隔离中(quarantined)/已旁路(sidelined) recipients stay 投递/丢弃 only --
  // unchanged demo behavior (task RA-5's Demo behavior notes: 隔离/阻断 are
  // NOT re-offered once a recipient is already quarantined).
  test('quarantined/sidelined statuses with an object_id expose deliver/discard only', () => {
    expect(recipientActionsForStatus('quarantined', true)).toEqual(['deliver', 'discard']);
    expect(recipientActionsForStatus('sidelined', true)).toEqual(['deliver', 'discard']);
  });
  // review High-2: without an addressable object_id, deliver/discard must
  // NOT be exposed -- there is nothing for object-mode dispose to target,
  // and the caller must never fall back to a whole-message dispose here.
  test('operable statuses WITHOUT an object_id expose no actions', () => {
    expect(recipientActionsForStatus('quarantined', false)).toEqual([]);
    expect(recipientActionsForStatus('pending_review', false)).toEqual([]);
    expect(recipientActionsForStatus('sidelined', false)).toEqual([]);
  });
  // task RA-5 (demo parity): 待审核(pending_review) additionally exposes
  // 隔离/阻断, matching the demo's single-recipient drawer order
  // (投递·隔离·阻断·丢弃).
  test('pending_review status with an object_id exposes deliver/quarantine/block/discard', () => {
    expect(recipientActionsForStatus('pending_review', true))
      .toEqual(['deliver', 'quarantine', 'block', 'discard']);
  });
  // review Medium-1: inbound_audit's real recipient status is "audited" (see
  // milter.go's "audit" branch), and its object-mode backend (approve/reject
  // by object_key) is already wired -- the detail drawer must expose the
  // same action set as pending_review, not treat it as non-operable.
  test('audited status with an object_id exposes deliver/quarantine/block/discard', () => {
    expect(recipientActionsForStatus('audited', true)).toEqual(['deliver', 'quarantine', 'block', 'discard']);
  });
  test('audited status without an object_id exposes no actions', () => {
    expect(recipientActionsForStatus('audited', false)).toEqual([]);
  });
  test('delivered statuses expose recall and notify regardless of object_id', () => {
    expect(recipientActionsForStatus('delivered', false)).toEqual(['recall', 'notify']);
    expect(recipientActionsForStatus('marked_delivered', false)).toEqual(['recall', 'notify']);
  });
  test('non-operable statuses expose no actions', () => {
    expect(recipientActionsForStatus('blocked', false)).toEqual([]);
    expect(recipientActionsForStatus('discarded', false)).toEqual([]);
  });
});

// review Medium: the AI verdict block's headline threat badge must be able
// to reflect the phish agent's OWN risk_level rather than only ever the
// cac_result-derived threat.
describe('derivePhishAgentThreatLevel', () => {
  test('maps critical and high risk_level to high', () => {
    expect(derivePhishAgentThreatLevel('critical')).toBe('high');
    expect(derivePhishAgentThreatLevel('high')).toBe('high');
  });
  test('maps medium and low risk_level directly', () => {
    expect(derivePhishAgentThreatLevel('medium')).toBe('medium');
    expect(derivePhishAgentThreatLevel('low')).toBe('low');
  });
  test('returns null for absent/unrecognized risk_level so callers fall back', () => {
    expect(derivePhishAgentThreatLevel(undefined)).toBeNull();
    expect(derivePhishAgentThreatLevel('')).toBeNull();
    expect(derivePhishAgentThreatLevel('bogus')).toBeNull();
  });
});

// review Low: "命中特征" hit-features must surface first-seen (spec §5.3).
describe('isNewSender', () => {
  test('true when first_seen_at equals received_at (this is the first-ever mail from this sender)', () => {
    expect(isNewSender('2026-07-01T10:00:00Z', '2026-07-01T10:00:00Z')).toBe(true);
  });
  test('true within a small tolerance (timestamp precision/formatting drift)', () => {
    expect(isNewSender('2026-07-01T10:00:00.500Z', '2026-07-01T10:00:00.000Z')).toBe(true);
  });
  test('false when first_seen_at is well before received_at (established sender)', () => {
    expect(isNewSender('2026-07-01T10:00:00Z', '2026-01-01T10:00:00Z')).toBe(false);
  });
  test('false when either timestamp is missing or unparseable', () => {
    expect(isNewSender(undefined, '2026-07-01T10:00:00Z')).toBe(false);
    expect(isNewSender('2026-07-01T10:00:00Z', undefined)).toBe(false);
    expect(isNewSender('not-a-date', '2026-07-01T10:00:00Z')).toBe(false);
  });
});

// detail-drawer alignment: confidence badge must show a fixed "no score" label
// for deterministic hits (blacklist/rule) rather than a misleading 0%/低 score.
describe('deriveConfidence', () => {
  test('deriveConfidence prefers hitSource over score', () => {
    expect(deriveConfidence({ prob: ['0.9'] }, 'blacklist')).toEqual({ kind: 'blacklist' });
  });
  // review Important: int_tag is a 0-7 severity bucket (see deriveThreatLevel),
  // NOT a probability -- it must never be used as a confidence fallback (a
  // previous version fed it through the pct formula, so int_tag:5 rendered
  // as an inverted/fabricated "置信度 5%"). With no prob and no hitSource,
  // there is no confidence signal, so the result must be kind:'none'.
  test('int_tag alone (no prob, no hitSource) is not a confidence source', () => {
    expect(deriveConfidence({ int_tag: 5 }, undefined)).toEqual({ kind: 'none' });
    expect(deriveConfidence({ int_tag: 1 }, undefined)).toEqual({ kind: 'none' });
  });
  test('rule hitSource also takes priority over any score', () => {
    expect(deriveConfidence({ prob: ['0.9'] }, 'rule')).toEqual({ kind: 'rule' });
  });
  test('score kind carries a 0-100 pct derived from cac prob (mirrors demo renderMailType)', () => {
    expect(deriveConfidence({ prob: ['0.9'] }, undefined)).toEqual({ kind: 'score', pct: 90 });
    expect(deriveConfidence({ prob: ['42'] }, undefined)).toEqual({ kind: 'score', pct: 42 });
  });
  test('no cac and no hitSource yields none', () => {
    expect(deriveConfidence(undefined, undefined)).toEqual({ kind: 'none' });
    expect(deriveConfidence({}, undefined)).toEqual({ kind: 'none' });
  });

  // CONFIDENCE SOURCE FIX (task 7): the real confidence for the overview
  // card is phish_agent_check.confidence, not cac.prob -- phishConfidence
  // must win over any cac score when present, but a deterministic
  // hitSource (blacklist/rule) still outranks even the phish-agent score.
  test('phishConfidence takes priority over cac.prob when both present', () => {
    expect(deriveConfidence({ prob: ['0.2'] }, undefined, 0.91)).toEqual({ kind: 'score', pct: 91 });
    expect(deriveConfidence({ prob: ['0.2'] }, undefined, 91)).toEqual({ kind: 'score', pct: 91 });
  });
  test('hitSource still wins over phishConfidence', () => {
    expect(deriveConfidence(undefined, 'blacklist', 0.91)).toEqual({ kind: 'blacklist' });
    expect(deriveConfidence(undefined, 'rule', 91)).toEqual({ kind: 'rule' });
  });
  test('phishConfidence alone (no cac) yields a score', () => {
    expect(deriveConfidence(undefined, undefined, 0.5)).toEqual({ kind: 'score', pct: 50 });
  });
  test('falls back to cac.prob when phishConfidence is absent/zero/NaN', () => {
    expect(deriveConfidence({ prob: ['0.9'] }, undefined, undefined)).toEqual({ kind: 'score', pct: 90 });
    expect(deriveConfidence({ prob: ['0.9'] }, undefined, 0)).toEqual({ kind: 'score', pct: 90 });
    expect(deriveConfidence({ prob: ['0.9'] }, undefined, Number.NaN)).toEqual({ kind: 'score', pct: 90 });
  });
});

// G3: deriveHitSource maps disposal_basis.policy_key into the hitSource
// deriveConfidence needs to render 「黑名单命中（无置信度）」/「规则命中（无置信度）」
// for deterministic hits that carry no real score.
describe('deriveHitSource', () => {
  test.each([
    ['SBL'], ['IPBL'], ['UBL'], ['RBL'],
  ])('%s (sender/IP/user/RBL allow-block list) maps to blacklist', (policyKey) => {
    expect(deriveHitSource({
      disposal_basis: { policy_key: policyKey, rule_name: 'r', rule_id: `${policyKey}-1`, action: 'quarantine' },
    } as unknown as MailLogDetail)).toBe('blacklist');
  });

  test.each([
    ['CR'], ['ACF'], ['OVERSEAS'], ['INTENT'], ['ATT-BASIC'], ['ATT-AV'], ['ATT-QR'], ['ATT-ENC'], ['URL'],
    ['IPFREQ'], ['AUTH'], ['BEHAVIOR'], ['RCPT'], ['SIM'],
  ])('%s (deterministic non-AI rule engine) maps to rule', (policyKey) => {
    expect(deriveHitSource({
      disposal_basis: { policy_key: policyKey, rule_name: 'r', rule_id: `${policyKey}-1`, action: 'quarantine' },
    } as unknown as MailLogDetail)).toBe('rule');
  });

  test.each([
    ['AI-PHISH'], ['AI-SPOOF'], ['AI-TRACE'],
  ])('%s (AI agent, has its own confidence) maps to undefined, not a hitSource', (policyKey) => {
    expect(deriveHitSource({
      disposal_basis: { policy_key: policyKey, rule_name: 'r', rule_id: `${policyKey}-1`, action: 'quarantine' },
    } as unknown as MailLogDetail)).toBeUndefined();
  });

  test('no disposal_basis/policy_key yields undefined', () => {
    expect(deriveHitSource({} as unknown as MailLogDetail)).toBeUndefined();
  });

  // A real score (phish_agent_check.confidence or cac.prob) must always win
  // over a policy_key-derived hitSource -- deriveConfidence gives hitSource
  // supremacy over score, so deriveHitSource must itself defer whenever a
  // real score exists, or it would silently suppress that score.
  test('phish_agent_check.confidence present defers to the real score (undefined)', () => {
    expect(deriveHitSource({
      phish_agent_check: { status: 'done', checked: true, confidence: 0.9 },
      disposal_basis: { policy_key: 'SBL', rule_name: 'r', rule_id: 'SBL-1', action: 'quarantine' },
    } as unknown as MailLogDetail)).toBeUndefined();
  });

  test('cac_result.prob with a numeric value defers to the real score (undefined)', () => {
    expect(deriveHitSource({
      cac_result: { prob: ['0.5'] },
      disposal_basis: { policy_key: 'IPBL', rule_name: 'r', rule_id: 'IPBL-1', action: 'quarantine' },
    } as unknown as MailLogDetail)).toBeUndefined();
  });

  // GT-12214 review Important: SBL/IPBL/UBL/RBL are shared black/allow-list
  // policy_keys -- an allow-listed (accept) hit must NOT resolve to
  // 'blacklist' (there is no allow-list confidence badge, so it must fall
  // through to undefined), while a genuine block-list hit on the same
  // policy_key still resolves to 'blacklist'.
  test.each([
    ['SBL'], ['IPBL'], ['UBL'], ['RBL'],
  ])('%s allow-list hit (hit_values.list_type=whitelist) maps to undefined, not blacklist', (policyKey) => {
    expect(deriveHitSource({
      disposal_basis: {
        policy_key: policyKey, rule_name: 'r', rule_id: `${policyKey}-1`, action: 'accept',
        hit_values: { list_type: 'whitelist' },
      },
    } as unknown as MailLogDetail)).toBeUndefined();
  });

  test.each([
    ['SBL'], ['IPBL'], ['UBL'], ['RBL'],
  ])('%s genuine block-list hit (no list_type / blacklist) still maps to blacklist', (policyKey) => {
    expect(deriveHitSource({
      disposal_basis: { policy_key: policyKey, rule_name: 'r', rule_id: `${policyKey}-1`, action: 'quarantine' },
    } as unknown as MailLogDetail)).toBe('blacklist');
    expect(deriveHitSource({
      disposal_basis: {
        policy_key: policyKey, rule_name: 'r', rule_id: `${policyKey}-1`, action: 'quarantine',
        hit_values: { list_type: 'blacklist' },
      },
    } as unknown as MailLogDetail)).toBe('blacklist');
  });
});

describe('deriveDomainName', () => {
  test('prefers sender_name when present', () => {
    expect(deriveDomainName('alice@example.com', 'Alice Smith')).toBe('Alice Smith');
  });
  test('falls back to the local part of sender when no sender_name', () => {
    expect(deriveDomainName('alice@example.com', undefined)).toBe('alice');
    expect(deriveDomainName('alice@example.com', '')).toBe('alice');
  });
});

describe('isSensitiveUrgent', () => {
  test('isSensitiveUrgent reads sensitive_keyword_hit', () => {
    expect(isSensitiveUrgent({ sensitive_keyword_hit: true } as unknown as MailLogDetail)).toBe(true);
    expect(isSensitiveUrgent({} as unknown as MailLogDetail)).toBe(false);
  });
  test('false when sensitive_keyword_hit is explicitly false', () => {
    expect(isSensitiveUrgent({ sensitive_keyword_hit: false } as unknown as MailLogDetail)).toBe(false);
  });
});

// GT-12422: 改判下拉顺序对齐原型（html_spec layer-6 opts-reclassify）。
describe('RECLASSIFY_TYPE_ORDER', () => {
  test('matches the prototype order exactly', () => {
    expect(RECLASSIFY_TYPE_ORDER).toEqual([
      'normal', 'subscription', 'spam', 'advertising', 'harmful', 'phishing',
      'account_compromised', 'suspicious', 'spoofing', 'virus', 'sensitive',
    ]);
  });
  test('covers every mailTypeConfig key exactly once (11 types)', () => {
    expect([...RECLASSIFY_TYPE_ORDER].sort()).toEqual(
      Object.keys(mailTypeConfig).sort(),
    );
  });
});
