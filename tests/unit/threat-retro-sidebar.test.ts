import { describe, it, expect } from 'vitest';
import { sidebarNavItems } from '@/lib/constants';
import zh from '../../messages/zh.json';
import en from '../../messages/en.json';
import th from '../../messages/th.json';
import ru from '../../messages/ru.json';

describe('agent-center sidebar entry', () => {
  it('agent-center has one overview child', () => {
    const center = sidebarNavItems.find((n) => n.id === 'agent-center');
    expect(center).toBeTruthy();
    expect(center!.children).toHaveLength(1);
    expect(center!.children?.[0]?.href).toBe('/agent-center/overview');
    expect(center!.children?.[0]?.titleKey).toBe('sidebar.agentOverview');
  });

  it('all four locales define sidebar.agentOverview', () => {
    for (const m of [zh, en, th, ru]) {
      const sidebar = (m as { sidebar: Record<string, unknown> }).sidebar;
      expect(sidebar.agentOverview).toBeTruthy();
    }
  });
});
