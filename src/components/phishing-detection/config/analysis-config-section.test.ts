import { describe, expect, it } from 'vitest';
import { committedAnalysisConfig, updateAnalysisConfig } from './analysis-config-section';
import type { PhishAnalysisConfig } from '@/types/phishing-config';

const config: PhishAnalysisConfig = {
  netdisk_domain: true,
  netdisk_extract: true,
  netdisk_spoof: false,
  version: 3,
  updated_at: '2026-08-18T00:00:00Z',
};

describe('analysis config dependency', () => {
  it('turns extraction off when its required domain recognition placeholder is disabled', () => {
    expect(updateAnalysisConfig(config, 'netdisk_domain', false)).toMatchObject({
      netdisk_domain: false,
      netdisk_extract: false,
    });
  });

  it('preserves unrelated later-phase placeholder values', () => {
    expect(updateAnalysisConfig(config, 'netdisk_spoof', true)).toEqual({
      ...config,
      netdisk_spoof: true,
    });
  });

  it('advances the local CAS version after a committed publication-pending response', () => {
    expect(committedAnalysisConfig({ ...config, netdisk_spoof: true })).toEqual({
      ...config,
      netdisk_spoof: true,
      version: 4,
    });
    expect(config.version).toBe(3);
  });
});
