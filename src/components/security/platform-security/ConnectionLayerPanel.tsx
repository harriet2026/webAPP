'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import { IPFilterPage } from '@/components/security/IPFilterPage';
import { IPFrequencyPage } from '@/components/security/IPFrequencyPage';
import { OverseasMailPage } from '@/components/security/OverseasMailPage';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { RBLFilterPage } from '@/components/security/RBLFilterPage';

type PolicyKey = 'ipFrequency' | 'ipFilter' | 'rbl' | 'overseas';

interface PolicyCard {
  key: PolicyKey;
  labelKey: string;
  // Neutral, static description of what the module does. We deliberately do NOT
  // interpolate live enforcement numbers here (thresholds / list counts / RBL
  // server counts): the panel has no query backing them, so any concrete value
  // would be fabricated state presented as real config on a security page.
  summaryKey: string;
}

const POLICIES: PolicyCard[] = [
  {
    key: 'ipFrequency',
    labelKey: 'platformSecurity.modules.ipFrequency',
    summaryKey: 'platformSecurity.modules.ipFrequencyHint',
  },
  {
    key: 'ipFilter',
    labelKey: 'platformSecurity.modules.ipFilter',
    summaryKey: 'platformSecurity.modules.ipFilterHint',
  },
  {
    key: 'rbl',
    labelKey: 'platformSecurity.modules.rbl',
    summaryKey: 'platformSecurity.modules.rblHint',
  },
  {
    key: 'overseas',
    labelKey: 'platformSecurity.modules.overseas',
    summaryKey: 'platformSecurity.modules.overseasHint',
  },
];

/**
 * 平台安全策略 - 连接层 4 模块面板（GT-11874）
 *
 * 对齐 demo `design/origin/demo/components/filter-rules-new/connection-layer-page.tsx`
 * 的"左侧策略摘要卡 + 右侧模块配置"布局：
 *   - 左侧：4 张策略卡（IP频率限制/IP黑白名单/RBL过滤/海外邮件检测）
 *   - 右侧：选中策略的完整配置（复用现有 4 个 webapp 页面，embedded 模式）
 *
 * 左侧策略卡的摘要文案为模块用途的静态描述，不含任何实时执行数值（阈值/黑白名单
 * 条数/RBL 服务器数等）——本面板没有对应查询，硬编码具体数字会把演示数据当成真实
 * 生效配置展示在安全页面上，误导管理员。若将来要展示真实值，应为各模块接入真实
 * useQuery 后再显示。
 */
export function ConnectionLayerPanel() {
  const t = useTranslations();
  const [selected, setSelected] = useState<PolicyKey>('ipFrequency');
  // GT-12105：海外邮件检测有未保存修改时，切换左侧策略需确认（取消留下 /
  // 继续放弃），与策略流水线抽屉的未保存确认语义一致。
  const [overseasDirty, setOverseasDirty] = useState(false);
  const [pendingSelect, setPendingSelect] = useState<PolicyKey | null>(null);

  const requestSelect = (next: PolicyKey) => {
    if (next === selected) return;
    if (selected === 'overseas' && overseasDirty) {
      setPendingSelect(next);
      return;
    }
    setSelected(next);
  };

  return (
    <div
      className="grid grid-cols-[208px_1fr] overflow-hidden rounded-lg border bg-background"
      style={{ minHeight: 'calc(100vh - 240px)' }}
    >
      {/* 左侧策略导航 */}
      <nav className="flex flex-col gap-1 overflow-y-auto border-r bg-muted/30 p-2">
        {POLICIES.map((policy) => {
          const isSelected = selected === policy.key;
          return (
            <button
              key={policy.key}
              type="button"
              onClick={() => requestSelect(policy.key)}
              aria-pressed={isSelected}
              className={cn(
                'flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                isSelected
                  ? 'bg-primary/10 text-primary'
                  : 'text-foreground/80 hover:bg-muted',
              )}
            >
              {/* 状态圆点：selected 实心，unselected 空心 */}
              <span
                aria-hidden="true"
                className={cn(
                  'mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full transition-colors',
                  isSelected
                    ? 'bg-primary'
                    : 'border-2 border-muted-foreground/40',
                )}
              />
              <div className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {t(policy.labelKey)}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {t(policy.summaryKey)}
                </span>
              </div>
            </button>
          );
        })}
      </nav>

      {/* 右侧模块配置 */}
      <div className="overflow-y-auto p-4">
        {selected === 'ipFrequency' && <IPFrequencyPage embedded showPlatformScopeBadge />}
        {selected === 'ipFilter' && <IPFilterPage embedded />}
        {selected === 'rbl' && <RBLFilterPage embedded />}
        {selected === 'overseas' && <OverseasMailPage embedded onDirtyChange={setOverseasDirty} />}
      </div>

      <AlertDialog open={pendingSelect != null} onOpenChange={(open) => { if (!open) setPendingSelect(null); }}>
        <AlertDialogContent data-testid="overseas-unsaved-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.unsavedChanges')}</AlertDialogTitle>
            <AlertDialogDescription>{t('common.unsavedChangesDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="overseas-unsaved-cancel">{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              data-testid="overseas-unsaved-discard"
              onClick={() => {
                if (pendingSelect) setSelected(pendingSelect);
                setPendingSelect(null);
                setOverseasDirty(false);
              }}
            >
              {t('common.discard')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}