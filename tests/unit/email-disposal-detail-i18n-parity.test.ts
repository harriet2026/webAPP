import { describe, it, expect } from 'vitest';
import en from '../../messages/en.json';
import zh from '../../messages/zh.json';
import ru from '../../messages/ru.json';
import th from '../../messages/th.json';

type MsgObj = Record<string, unknown>;
const locales: Record<string, MsgObj> = { en, zh, ru, th };

// Every key path the email-disposal detail drawer (overview/analysis/features/
// delivery sections + the mailType/correctionSource badge namespaces) reads.
// Mirrors the STRING_PATHS convention from
// `src/components/link-logs/i18n-parity.test.ts`: covers all of DD-12's
// genuinely-new keys (mailType.*, correctionSource.*, overview.corrected*/
// hitFeatures/authVerification/authResult.*/recipientStatus.*/reclassify.*,
// analysis.contentDetails/aiVerdict.*/noAiData) plus a representative sample
// of the already-translated keys from DD-7..DD-11 so a future edit that
// silently drops one of those doesn't go unnoticed either.
const STRING_PATHS: string[][] = [
  // drawer-shell-level keys (pre-DD-12, sampled)
  ['emailDisposal', 'detail', 'overviewAndHandle'],
  ['emailDisposal', 'detail', 'securityAnalysis'],
  ['emailDisposal', 'detail', 'detailedFeatures'],
  ['emailDisposal', 'detail', 'deliveryStatus'],
  ['emailDisposal', 'detail', 'originalLog'],
  ['emailDisposal', 'detail', 'breadcrumb'],
  ['emailDisposal', 'detail', 'findSimilar'],
  ['emailDisposal', 'detail', 'close'],
  ['emailDisposal', 'detail', 'errors', 'loadFailed'],

  // detail.mailType.* -- brand-new namespace (DD-12), 11 EmailType values
  ['emailDisposal', 'detail', 'mailType', 'phishing'],
  ['emailDisposal', 'detail', 'mailType', 'virus'],
  ['emailDisposal', 'detail', 'mailType', 'accountCompromised'],
  ['emailDisposal', 'detail', 'mailType', 'spoofing'],
  ['emailDisposal', 'detail', 'mailType', 'harmful'],
  ['emailDisposal', 'detail', 'mailType', 'spam'],
  ['emailDisposal', 'detail', 'mailType', 'advertising'],
  ['emailDisposal', 'detail', 'mailType', 'suspicious'],
  ['emailDisposal', 'detail', 'mailType', 'sensitive'],
  ['emailDisposal', 'detail', 'mailType', 'normal'],
  ['emailDisposal', 'detail', 'mailType', 'subscription'],

  // detail.correctionSource.* -- brand-new namespace (DD-12)
  ['emailDisposal', 'detail', 'correctionSource', 'adminRelease'],
  ['emailDisposal', 'detail', 'correctionSource', 'adminRecall'],
  ['emailDisposal', 'detail', 'correctionSource', 'userRetrieval'],
  ['emailDisposal', 'detail', 'correctionSource', 'unknown'],

  // overview.* -- pre-DD-12 keys (sampled)
  ['emailDisposal', 'detail', 'overview', 'threatLevel'],
  ['emailDisposal', 'detail', 'overview', 'intentLabels'],
  ['emailDisposal', 'detail', 'overview', 'threat', 'high'],
  ['emailDisposal', 'detail', 'overview', 'threat', 'medium'],
  ['emailDisposal', 'detail', 'overview', 'threat', 'low'],
  ['emailDisposal', 'detail', 'overview', 'aiReasoning'],
  ['emailDisposal', 'detail', 'overview', 'generateAi'],
  ['emailDisposal', 'detail', 'overview', 'basicInfo'],
  ['emailDisposal', 'detail', 'overview', 'action'],
  ['emailDisposal', 'detail', 'overview', 'subject'],
  ['emailDisposal', 'detail', 'overview', 'sender'],
  ['emailDisposal', 'detail', 'overview', 'recipient'],
  ['emailDisposal', 'detail', 'overview', 'emailContent'],
  ['emailDisposal', 'detail', 'overview', 'noContent'],
  ['emailDisposal', 'detail', 'overview', 'collapse'],
  ['emailDisposal', 'detail', 'overview', 'cancel'],
  ['emailDisposal', 'detail', 'overview', 'confirmBtn'],
  // overview.mailType.label -- still read by threat-summary-card.tsx. The
  // sibling normal/spam/phishing values (the OLD, unrelated legacy 3-value
  // block that used to back the now-deleted orphaned tabs/overview-tab.tsx)
  // were removed as dead keys by Task 13 (i18n cleanup); do not re-add them
  // without a live `src` caller.
  ['emailDisposal', 'detail', 'overview', 'mailType', 'label'],

  // overview.* -- genuinely NEW keys (DD-12, overview-section.tsx / recipient-status.tsx / reclassify-dialog.tsx)
  ['emailDisposal', 'detail', 'overview', 'corrected'],
  ['emailDisposal', 'detail', 'overview', 'correctedTooltip'],
  ['emailDisposal', 'detail', 'overview', 'hitFeatures'],
  ['emailDisposal', 'detail', 'overview', 'authVerification'],
  ['emailDisposal', 'detail', 'overview', 'authResult', 'pass'],
  ['emailDisposal', 'detail', 'overview', 'authResult', 'fail'],
  ['emailDisposal', 'detail', 'overview', 'authResult', 'softfail'],
  ['emailDisposal', 'detail', 'overview', 'authResult', 'none'],
  ['emailDisposal', 'detail', 'overview', 'recipientStatus', 'title'],
  ['emailDisposal', 'detail', 'overview', 'recipientStatus', 'colRecipients'],
  ['emailDisposal', 'detail', 'overview', 'recipientStatus', 'colStatus'],
  ['emailDisposal', 'detail', 'overview', 'recipientStatus', 'colActions'],
  ['emailDisposal', 'detail', 'overview', 'recipientStatus', 'status', 'delivered'],
  ['emailDisposal', 'detail', 'overview', 'recipientStatus', 'status', 'marked_delivered'],
  ['emailDisposal', 'detail', 'overview', 'recipientStatus', 'status', 'quarantined'],
  ['emailDisposal', 'detail', 'overview', 'recipientStatus', 'status', 'pending_review'],
  ['emailDisposal', 'detail', 'overview', 'recipientStatus', 'status', 'sidelined'],
  ['emailDisposal', 'detail', 'overview', 'recipientStatus', 'status', 'blocked'],
  ['emailDisposal', 'detail', 'overview', 'recipientStatus', 'status', 'rejected'],
  ['emailDisposal', 'detail', 'overview', 'recipientStatus', 'status', 'discarded'],
  ['emailDisposal', 'detail', 'overview', 'recipientStatus', 'notOperable'],
  // NB: recipient-status.tsx's actual not-operable tooltip key is
  // missingObjectIdTooltip (see its `t('recipientStatus.missingObjectIdTooltip')`
  // call) -- blockedTooltip/discardedTooltip named here previously don't
  // exist in ANY locale (not even zh, the authoring baseline) and are not
  // read anywhere in src/, so they were stale leftovers from an earlier
  // naming, not a real missing-translation regression.
  ['emailDisposal', 'detail', 'overview', 'recipientStatus', 'missingObjectIdTooltip'],
  ['emailDisposal', 'detail', 'overview', 'recipientStatus', 'action', 'deliver'],
  ['emailDisposal', 'detail', 'overview', 'recipientStatus', 'action', 'discard'],
  ['emailDisposal', 'detail', 'overview', 'recipientStatus', 'action', 'recall'],
  ['emailDisposal', 'detail', 'overview', 'recipientStatus', 'readOnlyTooltip'],
  ['emailDisposal', 'detail', 'overview', 'recipientStatus', 'selected'],
  ['emailDisposal', 'detail', 'overview', 'recipientStatus', 'empty'],
  ['emailDisposal', 'detail', 'overview', 'recipientStatus', 'actionSuccess'],
  ['emailDisposal', 'detail', 'overview', 'recipientStatus', 'actionFailed'],
  ['emailDisposal', 'detail', 'overview', 'recipientStatus', 'notApplicable'],
  ['emailDisposal', 'detail', 'overview', 'recipientStatus', 'bulkResult'],
  ['emailDisposal', 'detail', 'overview', 'recipientStatus', 'confirmDiscard', 'title'],
  ['emailDisposal', 'detail', 'overview', 'recipientStatus', 'confirmDiscard', 'body'],
  ['emailDisposal', 'detail', 'overview', 'reclassify', 'title'],
  ['emailDisposal', 'detail', 'overview', 'reclassify', 'body'],
  ['emailDisposal', 'detail', 'overview', 'reclassify', 'noChange'],

  // analysis.* -- pre-DD-12 keys (sampled)
  ['emailDisposal', 'detail', 'analysis', 'stage'],
  ['emailDisposal', 'detail', 'analysis', 'items'],
  ['emailDisposal', 'detail', 'analysis', 'finalVerdict'],
  ['emailDisposal', 'detail', 'analysis', 'notIntegrated'],
  ['emailDisposal', 'detail', 'analysis', 'stageName', 'connection'],
  ['emailDisposal', 'detail', 'analysis', 'verdict', 'malicious'],
  ['emailDisposal', 'detail', 'analysis', 'status', 'pass'],
  ['emailDisposal', 'detail', 'analysis', 'status', 'skipped'],
  ['emailDisposal', 'detail', 'analysis', 'check', 'ipRateLimit'],
  ['emailDisposal', 'detail', 'analysis', 'check', 'phishingAgent'],
  ['emailDisposal', 'detail', 'analysis', 'check', 'spoofingAgent'],
  ['emailDisposal', 'detail', 'analysis', 'check', 'threatRetroAgent'],

  // analysis.* -- genuinely NEW keys (DD-12, analysis-section.tsx)
  ['emailDisposal', 'detail', 'analysis', 'contentDetails'],
  ['emailDisposal', 'detail', 'analysis', 'aiVerdict', 'title'],
  ['emailDisposal', 'detail', 'analysis', 'aiVerdict', 'viewDetails'],
  ['emailDisposal', 'detail', 'analysis', 'aiVerdict', 'hideDetails'],
  ['emailDisposal', 'detail', 'analysis', 'aiVerdict', 'threat', 'high'],
  ['emailDisposal', 'detail', 'analysis', 'aiVerdict', 'threat', 'medium'],
  ['emailDisposal', 'detail', 'analysis', 'aiVerdict', 'threat', 'low'],
  ['emailDisposal', 'detail', 'analysis', 'aiVerdict', 'threat', 'none'],
  ['emailDisposal', 'detail', 'analysis', 'noAiData'],

  // features.* -- pre-DD-12 keys (sampled)
  ['emailDisposal', 'detail', 'features', 'basicInfo'],
  ['emailDisposal', 'detail', 'features', 'tid'],
  ['emailDisposal', 'detail', 'features', 'receiveTime'],
  ['emailDisposal', 'detail', 'features', 'direction'],
  ['emailDisposal', 'detail', 'features', 'directionValue', 'inbound'],
  ['emailDisposal', 'detail', 'features', 'senderRecipientInfo'],
  ['emailDisposal', 'detail', 'features', 'urlDetection'],
  ['emailDisposal', 'detail', 'features', 'noData'],

  // GT-12727：命中模块清单的新 key。i18n-literal-keys.test.ts 只查 zh/en，
  // 漏掉 th/ru 时 next-intl 不报错、只把 key 原样渲染给用户；列进 STRING_PATHS
  // 才拿到四语守卫。
  ['emailDisposal', 'detail', 'features', 'hitModules'],
  ['emailDisposal', 'detail', 'features', 'hitModulesHint'],
  ['emailDisposal', 'detail', 'features', 'effectiveFor'],
  ['emailDisposal', 'detail', 'features', 'matchedOnlyFor'],
  ['emailDisposal', 'detail', 'features', 'attachmentSecurity'],
  ['emailDisposal', 'detail', 'features', 'virusScan'],
  ['emailDisposal', 'detail', 'features', 'yes'],
  ['emailDisposal', 'detail', 'features', 'no'],
  ['emailDisposal', 'detail', 'features', 'virus', 'detected'],
  ['emailDisposal', 'detail', 'features', 'virus', 'clean'],
  ['emailDisposal', 'detail', 'features', 'virus', 'error'],

  // delivery.* -- pre-DD-12 keys (sampled)
  ['emailDisposal', 'detail', 'delivery', 'recipient'],
  ['emailDisposal', 'detail', 'delivery', 'status'],
  ['emailDisposal', 'detail', 'delivery', 'time'],
  ['emailDisposal', 'detail', 'delivery', 'errorMessage'],
  ['emailDisposal', 'detail', 'delivery', 'noData'],
  ['emailDisposal', 'detail', 'delivery', 'statusValue', 'success'],
  ['emailDisposal', 'detail', 'delivery', 'statusValue', 'failed'],
];

function getPath(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const seg of path) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

describe('emailDisposal detail-drawer i18n parity', () => {
  for (const [name, msg] of Object.entries(locales)) {
    for (const path of STRING_PATHS) {
      it(`${name} has ${path.join('.')}`, () => {
        const v = getPath(msg, path);
        expect(typeof v === 'string' && v.length > 0, `${name} missing ${path.join('.')}`).toBe(true);
      });
    }
  }
});

// Recursive key-set diff across all four locales for the whole
// emailDisposal.detail subtree -- unlike STRING_PATHS above (a hand-curated
// sample that a new key can be added to zh and silently forgotten in
// en/th/ru without failing anything), this walks every key that actually
// exists in any locale's emailDisposal.detail object and asserts the other
// three locales have the same key with a non-empty string value. zh is the
// authoring baseline (project convention: "zh 为基准"), but the diff is
// computed against the UNION of all locales' keys so a key added only to
// en/th/ru (not zh) is caught too.
function flattenKeys(obj: unknown, prefix: string, out: Set<string>): void {
  if (obj == null || typeof obj !== 'object') return;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v != null && typeof v === 'object' && !Array.isArray(v)) {
      flattenKeys(v, path, out);
    } else {
      out.add(path);
    }
  }
}

describe('emailDisposal detail-drawer i18n key-set parity (recursive)', () => {
  const detailByLocale: Record<string, unknown> = {};
  for (const [name, msg] of Object.entries(locales)) {
    detailByLocale[name] = getPath(msg, ['emailDisposal', 'detail']);
  }

  const allKeys = new Set<string>();
  for (const detail of Object.values(detailByLocale)) {
    flattenKeys(detail, '', allKeys);
  }

  it('found a non-trivial number of keys (sanity check the fixture wiring)', () => {
    expect(allKeys.size).toBeGreaterThan(100);
  });

  for (const [name, detail] of Object.entries(detailByLocale)) {
    for (const key of allKeys) {
      it(`${name} has non-empty string at emailDisposal.detail.${key}`, () => {
        const v = getPath(detail, key.split('.'));
        expect(typeof v === 'string' && v.length > 0, `${name} missing or empty emailDisposal.detail.${key}`).toBe(true);
      });
    }
  }
});
