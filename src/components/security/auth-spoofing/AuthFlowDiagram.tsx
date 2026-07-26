'use client';

import { useTranslations } from 'next-intl';
import { ChevronRight } from 'lucide-react';
import type { AuthSpoofingAction } from '@/types/auth-spoofing';
import { flowSubKey } from '@/lib/auth-spoofing-labels';
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
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {nodes.map((node, idx) => (
          <div key={node.id} className="flex items-center gap-2">
            <button
              type="button"
              onClick={node.clickable ? () => onNodeClick(node.id as ProtocolTab) : undefined}
              disabled={!node.clickable}
              className={cn(
                'min-w-[70px] rounded-lg px-3 py-2 text-center transition-all',
                node.color,
                node.clickable ? 'cursor-pointer' : 'cursor-default',
                node.clickable && activeTab === node.id && 'ring-2 ring-primary ring-offset-2',
              )}
            >
              <div className="text-xs font-medium">{node.label}</div>
              {node.sub && <div className="mt-0.5 text-[10px] opacity-70">{node.sub}</div>}
            </button>
            {idx < nodes.length - 1 && (
              <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
