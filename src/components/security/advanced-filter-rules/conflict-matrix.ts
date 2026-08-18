// Primary-action × addon conflict matrix (demo/V3, user-decided — do NOT copy
// the pre-rewrite validation module's ADDON_CONFLICTS, that is a different/
// older matrix).
export type PrimaryAction =
  | 'none'
  | 'deliver'
  | 'tagDeliver'
  | 'quarantine'
  | 'review'
  | 'discard';

export type AddonKey =
  | 'detailedLog'
  | 'adminNotify'
  | 'emailTag'
  | 'disclaimer'
  | 'externalReminder'
  | 'deleteAttachment'
  | 'forwardServer'
  | 'modifyHeader';

// Render order for the layer-4 addons table. detailedLog has no UI entry
// point (it is a data-model-only addon), so it is intentionally excluded.
export const UI_ADDON_KEYS: AddonKey[] = [
  'disclaimer',
  'externalReminder',
  'adminNotify',
  'deleteAttachment',
  'emailTag',
  'forwardServer',
  'modifyHeader',
];

const QUARANTINE_DISABLED: AddonKey[] = ['forwardServer', 'modifyHeader'];

// discard: only adminNotify remains available.
const DISCARD_DISABLED: AddonKey[] = [
  'disclaimer',
  'externalReminder',
  'deleteAttachment',
  'emailTag',
  'forwardServer',
  'modifyHeader',
];

export function disabledAddons(action: PrimaryAction): AddonKey[] {
  switch (action) {
    case 'quarantine':
      return [...QUARANTINE_DISABLED];
    case 'discard':
      return [...DISCARD_DISABLED];
    case 'none':
    case 'deliver':
    case 'tagDeliver':
    case 'review':
    default:
      return [];
  }
}
