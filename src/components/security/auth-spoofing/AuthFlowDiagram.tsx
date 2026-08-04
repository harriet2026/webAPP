'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronRight } from 'lucide-react';
import type { AuthSpoofingAction } from '@/types/auth-spoofing';
import { flowSubKey } from '@/lib/auth-spoofing-labels';
import { usePointerHover } from '@/hooks/use-pointer-hover';
import { cn } from '@/lib/utils';

type ProtocolTab = 'spf' | 'dkim' | 'dmarc' | 'ptr';

interface AuthFlowDiagramProps {
  failActions: Record<ProtocolTab, AuthSpoofingAction>;
  activeTab: ProtocolTab;
  onNodeClick: (tab: ProtocolTab) => void;
}

const STATIC_COLOR = 'bg-muted text-muted-foreground';

const PROTOCOL_BASE_COLOR: Record<ProtocolTab, string> = {
  spf: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
  dkim: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
  dmarc: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300',
  ptr: 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300',
};

const DISCARD_COLOR = 'bg-black text-white';

const PROTOCOL_ORDER: ProtocolTab[] = ['spf', 'dkim', 'dmarc', 'ptr'];

export function AuthFlowDiagram({ failActions, activeTab, onNodeClick }: AuthFlowDiagramProps) {
  const t = useTranslations('authSpoofing');

  type Node = {
    id: 'pipeline' | ProtocolTab | 'next';
    label: string;
    sub?: string;
    color: string;
    clickable: boolean;
  };

  const nodes: Node[] = [
    {
      id: 'pipeline',
      label: t('flowNode.pipeline'),
      sub: t('flowNode.pipelineSub'),
      color: STATIC_COLOR,
      clickable: false,
    },
    ...PROTOCOL_ORDER.map((key) => {
      const action = failActions[key];
      const isPtr = key === 'ptr';
      return {
        id: key,
        label: key.toUpperCase(),
        sub: t(flowSubKey(action, isPtr) as any),
        color: action === 'discard' ? DISCARD_COLOR : PROTOCOL_BASE_COLOR[key],
        clickable: true,
      } satisfies Node;
    }),
    {
      id: 'next',
      label: t('flowNode.next'),
      color: STATIC_COLOR,
      clickable: false,
    },
  ];

  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <div className="mb-3 text-xs text-muted-foreground">{t('flowTitle')}</div>
      <div className="flex items-center gap-2 overflow-x-auto py-1">
        {nodes.map((node, idx) => (
          <div key={node.id} className="flex items-center gap-2">
            <FlowNodeButton
              active={node.clickable && activeTab === node.id}
              clickable={node.clickable}
              colorClass={node.color}
              onClick={node.clickable ? () => onNodeClick(node.id as ProtocolTab) : undefined}
            >
              <div className="text-xs font-medium">{node.label}</div>
              {node.sub && <div className="mt-0.5 text-[10px] opacity-70">{node.sub}</div>}
            </FlowNodeButton>
            {idx < nodes.length - 1 && (
              <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// 流程节点按钮：可点节点的 hover 为 pointer 驱动的内嵌 hairline（柔和交互反馈规格 §7.2），
// 不做位移/缩放；selected(ring-primary) 与 hover 分层，focus-visible 独立 ring。
function FlowNodeButton({
  active,
  clickable,
  colorClass,
  onClick,
  children,
}: {
  active: boolean;
  clickable: boolean;
  colorClass: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  const { pointerHoverProps } = usePointerHover<HTMLButtonElement>({ disabled: !clickable });

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={cn(
        'min-w-[70px] rounded-lg px-3 py-2 text-center outline-none',
        'transition-[box-shadow] duration-[120ms] ease-out motion-reduce:transition-none',
        colorClass,
        clickable ? 'cursor-pointer' : 'cursor-default',
        clickable && 'data-[hovered=true]:shadow-[inset_0_0_0_1px_color-mix(in_oklab,currentColor_35%,transparent)]',
        'focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2',
        active && 'ring-2 ring-primary ring-offset-2',
      )}
      {...pointerHoverProps}
    >
      {children}
    </button>
  );
}
