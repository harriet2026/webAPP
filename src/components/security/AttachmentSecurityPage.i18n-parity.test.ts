import { describe, expect, it } from 'vitest';
import en from '@/../messages/en.json';
import ru from '@/../messages/ru.json';
import th from '@/../messages/th.json';
import zh from '@/../messages/zh.json';

const locales: Record<string, Record<string, unknown>> = { zh, en, th, ru };

const required = [
  'title', 'masterSwitchLabel',
  'tabs.basicLimit', 'tabs.antivirus', 'tabs.image', 'tabs.encrypted',
  'direction.receiveFull',
  'toast.loadFailed', 'toast.saveSuccess', 'toast.saveFailed',
  ...['quarantine', 'audit', 'reject', 'discard', 'accept', 'partial_skip'].map((key) => `actions.${key}`),
  ...[
    'attachmentStructure', 'currentDirection', 'items', 'levels', 'unlimited', 'unlimitedHint',
    'unlimitedWarning', 'nestedProtection', 'performanceProtection', 'seconds', 'receiveDefault',
    'attachmentCountMax', 'attachmentSizeMaxKb', 'nestedZipCountMax', 'nestedFileCountMax',
    'nestedLevelMax', 'scanTimeoutSec', 'exceedAction', 'save',
  ].map((key) => `basicLimit.${key}`),
  ...[
    'serverConfig', 'antivirusServerHost', 'antivirusServerPort', 'virusDbStatus', 'actualCapabilityHint',
    'updateNow', 'configured', 'notConfigured', 'autoUpdate', 'daily', 'actionConfig', 'virusAction',
    'timeoutAction', 'receiveDefault', 'updateSuccess', 'updateFailed',
  ].map((key) => `antivirus.${key}`),
  ...[
    'ocrDetection', 'detectionMode', 'ocrLimit', 'ocrLimitDisabledHint', 'attachments', 'ocrMode_none', 'ocrMode_light',
    'qrDetection', 'qrMode_none', 'qrMode_light', 'qrMode_deep', 'lightConfig',
    'deepConfig', 'routeModules', 'execAction', 'barcodeExempt', 'urlDetection', 'expandShortLink',
    'keywordFilter', 'scanRange', 'urlPath', 'textContent', 'intentEngine', 'detectCategory',
    'highRisk', 'mediumRisk', 'lowRisk', 'advancedRule', 'advancedRuleHint', 'arbitration',
    'highestPriority', 'firstMatch', 'detectLimit', 'items', 'exceedAction', 'passWarn',
    'isolateFallback', 'enable',
  ].map((key) => `imageDetect.${key}`),
  ...[
    'detectPolicy', 'mode_none', 'mode_detectOnly', 'mode_deep', 'decryptFailAction', 'receiveDefault',
    'passwordSources', 'extractFromBody', 'usePasswordBook', 'advancedOptions', 'recursiveDetectDepth',
    'markSuspicious',
  ].map((key) => `encrypted.${key}`),
  ...[
    'globalTitle', 'systemAdminOnly', 'password', 'createdAt', 'actions', 'empty',
    'newPasswordPlaceholder', 'add', 'delete', 'addSuccess', 'addFailed', 'deleteSuccess',
    'deleteFailed', 'loadFailed',
  ].map((key) => `encrypted.passwordBook.${key}`),
  'validation.duplicatePassword', 'validation.emptyPassword',
  ...[
    'attachmentCount', 'attachmentSize', 'nestedProtection', 'scanTimeout', 'exceedAction',
    'antivirusHost', 'virusAction', 'antivirusTimeout', 'ocrMode', 'qrMode', 'arbitration',
    'qrLimit', 'encryptedMode', 'decryptFailAction',
  ].map((key) => `tooltips.${key}`),
];

function get(obj: unknown, path: string) {
  return path.split('.').reduce<unknown>((value, key) => (
    value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined
  ), obj);
}

describe('AttachmentSecurityPage four-locale parity', () => {
  for (const [locale, messages] of Object.entries(locales)) {
    for (const path of required) {
      it(`${locale} has attachmentSecurity.${path}`, () => {
        const value = get(messages, `attachmentSecurity.${path}`);
        expect(typeof value === 'string' && value.length > 0, `${locale} missing ${path}`).toBe(true);
      });
    }
  }
});
