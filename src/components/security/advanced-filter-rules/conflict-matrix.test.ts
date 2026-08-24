import { describe, it, expect } from 'vitest';
import { disabledAddons, UI_ADDON_KEYS, type PrimaryAction, type AddonKey } from './conflict-matrix';

const ALL_ADDONS: AddonKey[] = [
  'detailedLog',
  'adminNotify',
  'emailTag',
  'disclaimer',
  'externalReminder',
  'deleteAttachment',
  'forwardServer',
  'modifyHeader',
];

describe('UI_ADDON_KEYS', () => {
  it('has the 7 UI-rendered addons in layer-4 order, excluding detailedLog', () => {
    expect(UI_ADDON_KEYS).toEqual([
      'disclaimer',
      'externalReminder',
      'adminNotify',
      'deleteAttachment',
      'emailTag',
      'forwardServer',
      'modifyHeader',
    ]);
    expect(UI_ADDON_KEYS).not.toContain('detailedLog');
  });
});

describe('disabledAddons', () => {
  const unrestricted: PrimaryAction[] = ['accept', 'proceed', 'audit'];
  it.each(unrestricted)('%s has no addon restrictions', (action) => {
    expect(disabledAddons(action)).toEqual([]);
  });

  it('quarantine disables only forwardServer and modifyHeader', () => {
    const disabled = disabledAddons('quarantine');
    expect(disabled.sort()).toEqual(['forwardServer', 'modifyHeader'].sort());
    // everything else stays available
    for (const k of ALL_ADDONS) {
      if (k === 'forwardServer' || k === 'modifyHeader') continue;
      expect(disabled).not.toContain(k);
    }
  });

  it('discard disables everything except adminNotify (and detailedLog, which has no UI)', () => {
    const disabled = disabledAddons('discard');
    expect(disabled.sort()).toEqual(
      ['disclaimer', 'externalReminder', 'deleteAttachment', 'emailTag', 'forwardServer', 'modifyHeader'].sort(),
    );
    expect(disabled).not.toContain('adminNotify');
  });
});
