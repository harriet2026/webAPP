import type {
  PhishBand,
  PhishProtectionLevel,
  PhishProtectionPreset,
} from '@/types/phishing-config';

export const PHISHING_PRESETS: Record<'standard' | 'strict', PhishProtectionPreset> = {
  standard: {
    level: 'standard',
    version: '2026-08-01',
    bands: [
      { min: 0, max: 40, disposition: 'accept' },
      { min: 40, max: 70, disposition: 'mark', mark_positions: ['subject_prefix'], mark_text: '[可疑]' },
      { min: 70, max: 90, disposition: 'quarantine' },
      { min: 90, max: 100, disposition: 'quarantine' },
    ],
  },
  strict: {
    level: 'strict',
    version: '2026-08-01',
    bands: [
      { min: 0, max: 30, disposition: 'accept' },
      { min: 30, max: 55, disposition: 'mark', mark_positions: ['subject_prefix'], mark_text: '[可疑]' },
      { min: 55, max: 80, disposition: 'quarantine' },
      { min: 80, max: 100, disposition: 'quarantine' },
    ],
  },
};

function normalizeBand(band: PhishBand) {
  return {
    min: band.min,
    max: band.max,
    disposition: band.disposition,
    mark_positions: [...(band.mark_positions ?? [])].sort(),
    mark_text: band.disposition === 'mark' ? band.mark_text ?? '' : '',
  };
}

export function bandsEqual(left: PhishBand[], right: PhishBand[]) {
  return JSON.stringify(left.map(normalizeBand)) === JSON.stringify(right.map(normalizeBand));
}

export function detectProtectionLevel(bands: PhishBand[]): PhishProtectionLevel {
  if (bandsEqual(bands, PHISHING_PRESETS.standard.bands)) return 'standard';
  if (bandsEqual(bands, PHISHING_PRESETS.strict.bands)) return 'strict';
  return 'custom';
}
