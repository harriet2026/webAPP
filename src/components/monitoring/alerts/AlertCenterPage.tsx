'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { RefreshCw, Bell, Filter, Settings } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { PageShell, PageHeader } from '@/components/shared/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AccessDenied } from '../infrastructure/StateBanners';
import { useAlertStats } from './hooks';
import { RealtimeTab } from './RealtimeTab';
import { RulesTab } from './RulesTab';
import { NotificationTab } from './NotificationTab';
import { SmtpConfigDrawer } from './SmtpConfigDrawer';

export function AlertCenterPage() {
  const t = useTranslations('alertCenter');
  const { isSystemAdmin } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState('realtime');
  const [smtpOpen, setSmtpOpen] = useState(false);
  const [ruleDrawerOpen, setRuleDrawerOpen] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const paused = tab !== 'realtime' || smtpOpen || ruleDrawerOpen || hidden;
  const { data: stats, isLoading: statsLoading, isError: statsError } = useAlertStats({ paused });

  const handleRefresh = () => {
    setSpinning(true);
    qc.invalidateQueries({ queryKey: ['alerts'] }).finally(() => setTimeout(() => setSpinning(false), 600));
  };

  if (!isSystemAdmin) {
    return <div data-testid="alert-access-denied"><AccessDenied /></div>;
  }

  const cards: { key: string; value: number; tone: string }[] = [
    { key: 'total', value: stats?.total ?? 0, tone: '' },
    { key: 'unconfirmed', value: stats?.unconfirmed ?? 0, tone: 'text-red-500' },
    { key: 'processing', value: stats?.processing ?? 0, tone: 'text-yellow-500' },
    { key: 'resolved', value: stats?.resolved ?? 0, tone: 'text-green-500' },
    { key: 'critical', value: stats?.critical ?? 0, tone: 'text-red-500' },
    { key: 'major', value: stats?.major ?? 0, tone: 'text-orange-500' },
  ];

  return (
    <PageShell data-testid="alert-center-page">
      <div className="flex items-center justify-between">
        <PageHeader title={t('title')} />
        <Button variant="outline" size="sm" onClick={handleRefresh} data-testid="alert-refresh">
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${spinning ? 'animate-spin' : ''}`} />
          {t('refresh')}
        </Button>
      </div>

      {statsLoading && <div className="text-sm text-muted-foreground" data-testid="alert-stats-loading">{t('loading')}</div>}
      {statsError && <div className="text-sm text-destructive" data-testid="alert-stats-error">{t('loadFailed')}</div>}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6" data-testid="alert-stat-cards">
        {cards.map((c) => (
          <Card key={c.key} data-testid={`stat-${c.key}`}>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">{t(`stats.${c.key}`)}</div>
              <div className={`mt-1 text-2xl font-bold ${c.tone}`}>{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab} data-testid="alert-tabs">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="realtime" className="gap-2" data-testid="alert-tab-realtime"><Bell className="h-4 w-4" />{t('tabs.realtime')}</TabsTrigger>
            <TabsTrigger value="rules" className="gap-2" data-testid="alert-tab-rules"><Filter className="h-4 w-4" />{t('tabs.rules')}</TabsTrigger>
            <TabsTrigger value="notification" className="gap-2" data-testid="alert-tab-notification"><Settings className="h-4 w-4" />{t('tabs.notification')}</TabsTrigger>
          </TabsList>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setSmtpOpen(true)} data-testid="alert-email-config">
            <Settings className="h-4 w-4" />{t('emailConfig')}
          </Button>
        </div>

        <TabsContent value="realtime" data-testid="alert-panel-realtime">
          <RealtimeTab paused={paused} />
        </TabsContent>
        <TabsContent value="rules" data-testid="alert-panel-rules">
          <RulesTab onDrawerOpenChange={setRuleDrawerOpen} />
        </TabsContent>
        <TabsContent value="notification" data-testid="alert-panel-notification">
          <NotificationTab onConfigure={() => setSmtpOpen(true)} />
        </TabsContent>
      </Tabs>

      <SmtpConfigDrawer open={smtpOpen} onOpenChange={setSmtpOpen} />
    </PageShell>
  );
}
