'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/contexts/auth-context';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PageShell, PageHeader } from '@/components/shared/page-shell';
import { AccessDenied, DegradedBanner } from './StateBanners';
import { ControlBar } from './ControlBar';
import { HardwareTab } from './HardwareTab';
import { ProcessesTab } from './ProcessesTab';
import { DatabaseTab } from './DatabaseTab';
import { StorageTab } from './StorageTab';
import { useNodes } from './hooks';
import { degradeMessage } from '@/lib/monitoring/degrade';
import type { TimeRange } from '@/types/monitoring';

export function InfrastructurePage() {
  const t = useTranslations('infrastructure');
  const { isSystemAdmin } = useAuth();
  const [node, setNode] = useState('');
  const [range, setRange] = useState<TimeRange>('24h');
  const [tab, setTab] = useState('hardware');

  // GT-11536: surface nodes-load failure so the operator sees a degraded
  // banner instead of a silently-empty node selector.
  const { data: nodesResp, isError: nodesError, isLoading: nodesLoading } = useNodes();
  const nodes = useMemo(() => nodesResp?.items ?? [], [nodesResp]);

  const effectiveNode = useMemo(() => {
    if (node) return node;
    if (nodes.length > 0) return nodes[0].id;
    return '';
  }, [node, nodes]);

  if (!isSystemAdmin) {
    return <AccessDenied />;
  }

  // GT-11699 / GT-11534: the node list now degrades (HTTP 200 + `degraded`)
  // instead of erroring when the TSDB is unavailable. Always render the full
  // page (ControlBar + Tabs) and surface the degraded state inline at the top,
  // so the operator keeps the node selector / range switch and each tab can
  // show its own degrade banner. `nodesError` is kept as a belt-and-suspenders
  // fallback for a genuine transport failure.
  const nodesDegraded = nodesResp?.degraded === true || nodesError;

  return (
    <PageShell data-testid="monitor-infrastructure-page">
      <PageHeader title={t('title')} />

      {nodesDegraded && (
        <DegradedBanner message={degradeMessage(nodesResp?.degraded_code, t)} />
      )}

      <ControlBar
        nodes={nodes}
        node={effectiveNode}
        range={range}
        onNodeChange={setNode}
        onRangeChange={setRange}
        // GT-11536: disable range switching while nodes are loading or
        // unavailable — there is no effective node to query, so a range
        // change would be a silent no-op.
        rangeDisabled={nodesLoading || nodes.length === 0}
      />

      <Tabs value={tab} onValueChange={setTab} data-testid="monitor-infrastructure-tabs">
        <TabsList data-testid="monitor-infrastructure-tab-list">
          <TabsTrigger value="hardware" data-testid="monitor-infrastructure-tab-hardware">{t('tabs.hardware')}</TabsTrigger>
          <TabsTrigger value="processes" data-testid="monitor-infrastructure-tab-processes">{t('tabs.processes')}</TabsTrigger>
          <TabsTrigger value="database" data-testid="monitor-infrastructure-tab-database">{t('tabs.database')}</TabsTrigger>
          <TabsTrigger value="storage" data-testid="monitor-infrastructure-tab-storage">{t('tabs.storage')}</TabsTrigger>
        </TabsList>

        <TabsContent value="hardware" data-testid="monitor-infrastructure-panel-hardware">
          <HardwareTab node={effectiveNode} range={range} />
        </TabsContent>
        <TabsContent value="processes" data-testid="monitor-infrastructure-panel-processes">
          <ProcessesTab node={effectiveNode} range={range} />
        </TabsContent>
        <TabsContent value="database" data-testid="monitor-infrastructure-panel-database">
          <DatabaseTab node={effectiveNode} range={range} />
        </TabsContent>
        <TabsContent value="storage" data-testid="monitor-infrastructure-panel-storage">
          <StorageTab node={effectiveNode} />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
