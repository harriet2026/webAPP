import { describe, expect, it } from 'vitest';
import { intentEngineEmbeddedLayoutClasses } from '@/components/security/intent-engine/layout';

describe('IntentEnginePage embedded layout', () => {
  it('bounds the page and scrolls only the body above a non-overlapping footer', () => {
    expect(intentEngineEmbeddedLayoutClasses.root).toContain('h-full');
    expect(intentEngineEmbeddedLayoutClasses.card).toContain('min-h-0');
    expect(intentEngineEmbeddedLayoutClasses.content).toContain('flex-1');
    expect(intentEngineEmbeddedLayoutClasses.body).toContain('overflow-y-auto');
    expect(intentEngineEmbeddedLayoutClasses.footer).toContain('shrink-0');
  });
});
