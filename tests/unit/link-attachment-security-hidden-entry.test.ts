import { describe, expect, test } from 'vitest';
import { offNavRouteTitles, sidebarNavItems } from '@/lib/constants';

describe('link and attachment security hidden entry', () => {
  test('stays out of the statistics navigation while preserving its direct-route title', () => {
    const statistics = sidebarNavItems.find((item) => item.id === 'statistics');

    expect(statistics).toBeTruthy();
    expect((statistics!.children ?? []).map((child) => child.id)).not.toContain(
      'link-attachment-security',
    );
    expect(offNavRouteTitles).toContainEqual({
      href: '/statistics/link-attachment-security',
      titleKey: 'sidebar.linkAttachmentSecurity',
    });
  });
});
