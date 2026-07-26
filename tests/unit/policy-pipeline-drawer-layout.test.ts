import { describe, expect, it, vi } from 'vitest';
import { pipelineDrawerResponsiveClasses } from '@/components/security/PolicyPipelinePage';

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe('PolicyPipelinePage 配置抽屉响应式布局（GT-12160）', () => {
  it('在 1024–1365px 使用 560px 抽屉，并在更窄视口保留页面边距', () => {
    expect(pipelineDrawerResponsiveClasses.sheet).toContain('data-[side=right]:w-[calc(100vw-2rem)]');
    expect(pipelineDrawerResponsiveClasses.sheet).toContain('min-[640px]:data-[side=right]:w-[560px]');
    expect(pipelineDrawerResponsiveClasses.sheet).toContain('min-[1366px]:data-[side=right]:w-[80vw]');
  });

  it('在收窄抽屉中将导航压缩为图标栏，避免挤压配置表单', () => {
    expect(pipelineDrawerResponsiveClasses.expandedNav).toContain('w-14');
    expect(pipelineDrawerResponsiveClasses.expandedNav).toContain('min-[1366px]:w-[200px]');
    expect(pipelineDrawerResponsiveClasses.expandedNavLabel).toContain('min-[1366px]:block');
  });
});
