'use client';

import { useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/contexts/auth-context';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PageShell, PageHeader } from '@/components/shared/page-shell';
import { AccessDenied } from './StateBanners';
import { DirectionControlBar } from './DirectionControlBar';
import { QueueTab } from './QueueTab';
import { DeliveryTab } from './DeliveryTab';
import { ConnectionTab } from './ConnectionTab';
import { useNodes } from '../infrastructure/hooks';
import type { TimeRange, MailflowDirection } from '@/types/monitoring';

export function MailflowPage() {
  const t = useTranslations('mailflow');
  const searchParams = useSearchParams();
  const { isSystemAdmin } = useAuth();
  const [node, setNode] = useState('');
  const [range, setRange] = useState<TimeRange>('24h');
  const [direction, setDirection] = useState<MailflowDirection>('receive');
  const [tab, setTab] = useState(() => {
    const requested = searchParams.get('tab');
    return requested === 'delivery' || requested === 'connection' ? requested : 'queue';
  });

  const { data: nodesResp } = useNodes();
  const nodes = useMemo(() => nodesResp?.items ?? [], [nodesResp]);

  const effectiveNode = useMemo(() => {
    if (node) return node;
    if (nodes.length > 0) return nodes[0].id;
    return '';
  }, [node, nodes]);

  if (!isSystemAdmin) {
    return <AccessDenied />;
  }

  return (
    <PageShell data-testid="monitor-mailflow-page">
      <PageHeader title={t('title')} />

      <DirectionControlBar
        nodes={nodes}
        node={effectiveNode}
        range={range}
        direction={direction}
        // Queue depth/age are node snapshots; the queue latency card and the
        // delivery/connection datasets consume the selected range/direction.
        directionDisabled={false}
        onNodeChange={setNode}
        onRangeChange={setRange}
        onDirectionChange={setDirection}
      />

      <Tabs value={tab} onValueChange={setTab} data-testid="monitor-mailflow-tabs">
        <TabsList data-testid="monitor-mailflow-tab-list">
          <TabsTrigger value="queue" data-testid="monitor-mailflow-tab-queue">{t('tabs.queue')}</TabsTrigger>
          <TabsTrigger value="delivery" data-testid="monitor-mailflow-tab-delivery">{t('tabs.delivery')}</TabsTrigger>
          <TabsTrigger value="connection" data-testid="monitor-mailflow-tab-connection">{t('tabs.connection')}</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" data-testid="monitor-mailflow-panel-queue">
          <QueueTab node={effectiveNode} range={range} direction={direction} />
        </TabsContent>
        <TabsContent value="delivery" data-testid="monitor-mailflow-panel-delivery">
          <DeliveryTab range={range} direction={direction} />
        </TabsContent>
        <TabsContent value="connection" data-testid="monitor-mailflow-panel-connection">
          <ConnectionTab node={effectiveNode} range={range} direction={direction} />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
