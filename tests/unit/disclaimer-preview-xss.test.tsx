import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DisclaimerPreview } from '@/components/security/mail-marking/DisclaimerPreview';
import type { DisclaimerBlock } from '@/components/security/mail-marking/types';

function makeBlock(content: string): DisclaimerBlock {
  return { content, positions: ['body_bottom'], format: 'auto' };
}

describe('DisclaimerPreview XSS sanitization', () => {
  it('strips <script> tags from the disclaimer content', () => {
    const { container } = render(
      <DisclaimerPreview block={makeBlock('hello<script>window.__pwned=1</script>')} />,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.innerHTML).not.toContain('window.__pwned');
    // benign text is preserved
    expect(container.textContent).toContain('hello');
  });

  it('strips inline event handlers (onerror) from injected markup', () => {
    const { container } = render(
      <DisclaimerPreview block={makeBlock('<img src=x onerror="window.__pwned=1">')} />,
    );
    const img = container.querySelector('img');
    // img may survive but its onerror handler must be removed
    if (img) {
      expect(img.getAttribute('onerror')).toBeNull();
    }
    expect(container.innerHTML).not.toContain('onerror');
  });

  it('preserves safe formatting markup', () => {
    const { container } = render(
      <DisclaimerPreview block={makeBlock('<strong>Confidential</strong>')} />,
    );
    expect(container.querySelector('strong')).not.toBeNull();
    expect(container.textContent).toContain('Confidential');
  });
});
