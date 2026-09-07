import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('native observe has no addon controls', () => {
  it('does not expose phishing observation marking', () => {
    const runtime = source('src/components/phishing-detection/config/runtime-risk-section.tsx');
    expect(runtime).toContain("observe_mark_enabled: false");
    expect(runtime).not.toContain('data-testid="observe-mark-enabled"');
    expect(runtime).not.toContain('observe-action-mark');
  });

  it('hides spoof marking controls while a protected object is observed', () => {
    const person = source('src/components/spoofing-detection/spoofing-person-form.tsx');
    const brand = source('src/components/spoofing-detection/spoofing-brand-form.tsx');
    expect(person).not.toContain('Observe sub-panel');
    expect(brand).toContain("mode !== 'observe' && action === 'accept'");
    expect(brand).not.toContain("mode === 'observe' || action === 'accept'");
  });

  it('persists the spoof form mode as the observe execution switch', () => {
    const person = source('src/components/spoofing-detection/spoofing-person-form.tsx');
    const brand = source('src/components/spoofing-detection/spoofing-brand-form.tsx');
    expect(person).toContain("observe_mode: mode === 'observe'");
    expect(brand).toContain("observe_mode: mode === 'observe'");
    expect(person).not.toContain('observe_mode: editing?.observe_mode ?? false');
    expect(brand).not.toContain('observe_mode: editing?.observe_mode ?? false');
  });
});
