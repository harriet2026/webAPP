import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { CollapsibleSectionTrigger } from '@/components/ui/collapsible-section-trigger';
import { SegmentedButton } from '@/components/ui/segmented-button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import {
  PipelinePolicyCard,
  PipelineDrawerNavButton,
  type PipelinePolicy,
} from '../pipeline-policy-card';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const POLICY: PipelinePolicy = {
  key: 'ipFilter',
  nameKey: 'pipeline.ipFilter',
  descKey: 'pipeline.ipFilterDesc',
  type: 'blocking',
  functional: true,
};

function renderCard(policy: PipelinePolicy, onActivate = vi.fn()) {
  render(
    <TooltipProvider>
      <Tooltip>
        <PipelinePolicyCard policy={policy} barColor="var(--action-block)" onActivate={onActivate} />
        <TooltipContent>tooltip</TooltipContent>
      </Tooltip>
    </TooltipProvider>,
  );
  return { onActivate, card: screen.getByTestId(`pipeline-policy-card-${policy.key}`) };
}

describe('策略流水线柔和交互反馈（2026-07-25 规格）', () => {
  describe('PipelinePolicyCard', () => {
    it('鼠标 pointerenter 进入 hovered，pointerleave 完全恢复', () => {
      const { card } = renderCard(POLICY);
      expect(card).not.toHaveAttribute('data-hovered');

      fireEvent.pointerEnter(card, { pointerType: 'mouse' });
      expect(card).toHaveAttribute('data-hovered', 'true');
      expect(card).toHaveClass(
        'data-[hovered=true]:border-foreground/20',
        'data-[hovered=true]:bg-muted/40',
        'motion-reduce:transition-none',
      );

      fireEvent.pointerLeave(card);
      expect(card).not.toHaveAttribute('data-hovered');
    });

    it('触摸输入不进入 hovered（无 sticky hover）', () => {
      const { card } = renderCard(POLICY);
      fireEvent.pointerEnter(card, { pointerType: 'touch' });
      expect(card).not.toHaveAttribute('data-hovered');
    });

    it('locked 卡片视为 disabled：不响应 hover、aria-disabled、不入 Tab 序', () => {
      const { card, onActivate } = renderCard({ ...POLICY, locked: true });
      fireEvent.pointerEnter(card, { pointerType: 'mouse' });
      expect(card).not.toHaveAttribute('data-hovered');
      expect(card).toHaveAttribute('aria-disabled', 'true');
      expect(card).not.toHaveAttribute('tabindex');
      fireEvent.keyDown(card, { key: 'Enter' });
      expect(onActivate).not.toHaveBeenCalled();
    });

    it('整卡键盘可达：role=button + Enter/Space 激活', () => {
      const { card, onActivate } = renderCard(POLICY);
      expect(card).toHaveAttribute('role', 'button');
      expect(card).toHaveAttribute('tabindex', '0');
      fireEvent.keyDown(card, { key: 'Enter' });
      fireEvent.keyDown(card, { key: ' ' });
      expect(onActivate).toHaveBeenCalledTimes(2);
      // 内部「配置」按钮移出 Tab 序，避免同一动作双焦点停留
      expect(screen.getByTestId('pipeline-policy-config-ipFilter')).toHaveAttribute('tabindex', '-1');
    });

    it('不再使用 transition-all 与硬编码蓝 hover', () => {
      const { card } = renderCard(POLICY);
      expect(card.className).not.toContain('transition-all');
      expect(card.className).not.toContain('hover:border-blue');
      expect(card.className).not.toContain('hover:bg-blue');
    });
  });

  describe('PipelineDrawerNavButton', () => {
    const renderNav = (isActive: boolean) => {
      render(
        <TooltipProvider>
          <PipelineDrawerNavButton
            testid="pipeline-drawer-nav-ipFilter"
            name="IP黑白名单"
            summary="摘要"
            dotOn
            isActive={isActive}
            collapsed={false}
            onSelect={vi.fn()}
          />
        </TooltipProvider>,
      );
      return screen.getByTestId('pipeline-drawer-nav-ipFilter');
    };

    it('未选中项 hovered 与 selected 可区分，移出后恢复', () => {
      const btn = renderNav(false);
      expect(btn).toHaveClass('border-transparent');
      expect(btn).not.toHaveClass('bg-primary/15');

      fireEvent.pointerEnter(btn, { pointerType: 'mouse' });
      expect(btn).toHaveAttribute('data-hovered', 'true');
      expect(btn).toHaveClass('data-[hovered=true]:bg-background');
      fireEvent.pointerLeave(btn);
      expect(btn).not.toHaveAttribute('data-hovered');
    });

    it('selected 用 primary 淡表面 + primary 左缘，hover 仅轻微加深且恒占 2px 左缘（无位移）', () => {
      const btn = renderNav(true);
      expect(btn).toHaveClass('bg-primary/15', 'border-primary', 'text-primary', 'border-l-2');
      expect(btn).toHaveClass('data-[hovered=true]:bg-primary/[0.18]');
      expect(btn.className).not.toContain('data-[hovered=true]:bg-background');
    });
  });

  describe('CollapsibleSectionTrigger', () => {
    const renderTrigger = () => {
      render(
        <Collapsible>
          <CollapsibleSectionTrigger data-testid="section-trigger">标签</CollapsibleSectionTrigger>
          <CollapsibleContent>内容</CollapsibleContent>
        </Collapsible>,
      );
      return screen.getByTestId('section-trigger');
    };

    it('pointer 驱动 hover，展开指示为单一 chevron 旋转（不交换图标节点）', () => {
      const trigger = renderTrigger();
      fireEvent.pointerEnter(trigger, { pointerType: 'mouse' });
      expect(trigger).toHaveAttribute('data-hovered', 'true');
      fireEvent.pointerLeave(trigger);
      expect(trigger).not.toHaveAttribute('data-hovered');

      const chevrons = trigger.querySelectorAll('svg');
      expect(chevrons).toHaveLength(1);
      expect(chevrons[0].getAttribute('class')).toContain(
        'group-data-[panel-open]/collapse-trigger:rotate-180',
      );
      expect(chevrons[0].getAttribute('class')).toContain('motion-reduce:transition-none');
    });

    it('文字与表面均使用语义 token，无硬编码蓝', () => {
      const trigger = renderTrigger();
      expect(trigger).toHaveClass('text-primary', 'data-[hovered=true]:bg-muted/50');
      expect(trigger.className).not.toContain('blue');
    });
  });

  describe('TabsTrigger（抽屉内模块页的黑/白名单等 Tab）', () => {
    it('pointer 驱动 hover，未选中项才有 hover 表面；无 transition-all', () => {
      render(
        <Tabs defaultValue="black">
          <TabsList>
            <TabsTrigger value="black" data-testid="tab-black">黑名单规则</TabsTrigger>
            <TabsTrigger value="white" data-testid="tab-white">白名单规则</TabsTrigger>
          </TabsList>
        </Tabs>,
      );
      const inactive = screen.getByTestId('tab-white');

      fireEvent.pointerEnter(inactive, { pointerType: 'mouse' });
      expect(inactive).toHaveAttribute('data-hovered', 'true');
      expect(inactive.className).toContain('not-data-active:data-[hovered=true]:bg-muted/40');
      expect(inactive.className).not.toContain('transition-all');
      expect(inactive.className).toContain('motion-reduce:transition-none');

      fireEvent.pointerLeave(inactive);
      expect(inactive).not.toHaveAttribute('data-hovered');

      fireEvent.pointerEnter(inactive, { pointerType: 'touch' });
      expect(inactive).not.toHaveAttribute('data-hovered');
    });
  });

  describe('SegmentedButton', () => {
    it('hover 只作用于未选中项；触摸不残留', () => {
      render(
        <div>
          <SegmentedButton selected={false} data-testid="seg-off">A</SegmentedButton>
          <SegmentedButton selected data-testid="seg-on">B</SegmentedButton>
        </div>,
      );
      const off = screen.getByTestId('seg-off');
      const on = screen.getByTestId('seg-on');

      fireEvent.pointerEnter(off, { pointerType: 'mouse' });
      expect(off).toHaveAttribute('data-hovered', 'true');
      fireEvent.pointerLeave(off);
      fireEvent.pointerEnter(off, { pointerType: 'touch' });
      expect(off).not.toHaveAttribute('data-hovered');

      fireEvent.pointerEnter(on, { pointerType: 'mouse' });
      expect(on).not.toHaveAttribute('data-hovered');
      expect(on).toHaveClass('bg-background', 'shadow-sm');
    });
  });
});
