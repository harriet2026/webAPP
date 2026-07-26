import { describe, it, expect } from 'vitest';
import en from '@/../messages/en.json';
import zh from '@/../messages/zh.json';
import ru from '@/../messages/ru.json';
import th from '@/../messages/th.json';

type MsgObj = Record<string, unknown>;
const locales: Record<string, MsgObj> = { en, zh, ru, th };

// Every key path the link-logs UI reads. Keeping this list in sync with the
// components guarantees no raw key renders in any of the four languages.
// `STRING_PATHS` must yield a non-empty string in every locale;
// `ARRAY_PATHS` must yield a non-empty array.
const STRING_PATHS: string[][] = [
  ['linkLogs', 'title'], ['linkLogs', 'eyebrow'], ['linkLogs', 'subtitle'],
  ['linkLogs', 'total'], ['linkLogs', 'empty'], ['linkLogs', 'view'], ['linkLogs', 'download'], ['linkLogs', 'close'],
  ['linkLogs', 'downloadFailed'],
  ['linkLogs', 'aiPlaceholder'], ['linkLogs', 'advancedFilter'], ['linkLogs', 'collapse'], ['linkLogs', 'search'], ['linkLogs', 'reset'],
  ['linkLogs', 'tenantScope'], ['linkLogs', 'allTenants'],
  ['linkLogs', 'filters', 'sender'], ['linkLogs', 'filters', 'tidPlaceholder'],
  ['linkLogs', 'filters', 'emailPlaceholder'], ['linkLogs', 'filters', 'urlPlaceholder'],
  ['linkLogs', 'filters', 'selectDate'],
  ['common', 'tenant'], ['common', 'all'],
  ['linkLogs', 'columns', 'clickTime'], ['linkLogs', 'columns', 'tid'], ['linkLogs', 'columns', 'clicker'],
  ['linkLogs', 'columns', 'sender'], ['linkLogs', 'columns', 'originalUrl'], ['linkLogs', 'columns', 'triggerStage'],
  ['linkLogs', 'columns', 'verdict'], ['linkLogs', 'columns', 'finalResult'], ['linkLogs', 'columns', 'userAction'], ['linkLogs', 'columns', 'action'],
  ['linkLogs', 'stages', 'cloud_intel'], ['linkLogs', 'stages', 'local_blacklist'], ['linkLogs', 'stages', 'phishing_agent'], ['linkLogs', 'stages', 'none'],
  ['linkLogs', 'verdicts', 'malicious'], ['linkLogs', 'verdicts', 'phishing'], ['linkLogs', 'verdicts', 'suspicious'], ['linkLogs', 'verdicts', 'safe'],
  ['linkLogs', 'results', 'alerted'], ['linkLogs', 'results', 'passed'], ['linkLogs', 'results', 'pending'],
  ['linkLogs', 'actions', 'proceeded'], ['linkLogs', 'actions', 'abandoned'], ['linkLogs', 'actions', 'skippedDeepInspect'], ['linkLogs', 'actions', 'none'],
  ['linkLogs', 'deepInspect', 'skipped'], ['linkLogs', 'deepInspect', 'running'], ['linkLogs', 'deepInspect', 'cached'],
  ['linkLogs', 'deepInspect', 'done'], ['linkLogs', 'deepInspect', 'timeout'], ['linkLogs', 'deepInspect', 'userSkipped'], ['linkLogs', 'deepInspect', 'unknown'],
  ['linkLogs', 'sources', 'body'], ['linkLogs', 'sources', 'attachment'],
  ['linkLogs', 'detail', 'breadcrumb'], ['linkLogs', 'detail', 'disposition'], ['linkLogs', 'detail', 'timeline'],
  ['linkLogs', 'detail', 'timelineHint'], ['linkLogs', 'detail', 'linkInfo'], ['linkLogs', 'detail', 'context'],
  ['linkLogs', 'detail', 'hit'], ['linkLogs', 'detail', 'checkedPassed'], ['linkLogs', 'detail', 'skipped'],
  ['linkLogs', 'detail', 'subject'], ['linkLogs', 'detail', 'clientIp'], ['linkLogs', 'detail', 'rewrittenUrl'], ['linkLogs', 'detail', 'clickSource'],
  ['sidebar', 'linkClicks'],
];

const ARRAY_PATHS: string[][] = [
  ['linkLogs', 'aiSuggestions'],
];

function getPath(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const seg of path) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

describe('linkLogs i18n parity', () => {
  for (const [name, msg] of Object.entries(locales)) {
    for (const path of STRING_PATHS) {
      it(`${name} has ${path.join('.')}`, () => {
        const v = getPath(msg, path);
        expect(typeof v === 'string' && v.length > 0, `${name} missing ${path.join('.')}`).toBe(true);
      });
    }
    for (const path of ARRAY_PATHS) {
      it(`${name} has non-empty array ${path.join('.')}`, () => {
        const v = getPath(msg, path);
        expect(Array.isArray(v) && v.length > 0, `${name} missing or empty array ${path.join('.')}`).toBe(true);
      });
    }
  }
});
