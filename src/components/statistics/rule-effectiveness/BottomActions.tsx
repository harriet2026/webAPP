'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

interface Props {
  csvUrl: string;
}

/**
 * 规则效能统计的底部操作栏——本期仅支持导出，不提供 PDF/AI 分析入口
 * （复用安全总览 BottomActions 的视觉外壳，但按本页需求裁剪操作项）。
 */
export function BottomActions({ csvUrl }: Props) {
  const t = useTranslations('ruleEffectiveness.bottomActions');

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-muted/30 px-4 py-3">
      <a href={csvUrl} download>
        <Button variant="outline" size="sm">
          <Download className="h-4 w-4" />
          {t('exportCsv')}
        </Button>
      </a>
    </div>
  );
}
