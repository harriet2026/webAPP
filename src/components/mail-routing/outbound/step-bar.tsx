'use client';

// 出站路由三步设置导航。代理 IP 与自定义投递通道均为可选配置：系统已有默认通道，因此三个
// 设置区始终可以直接切换，不以代理列表是否为空作为前置门禁。

import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StepBarProps {
  step: 1 | 2 | 3;
  onStepChange: (step: 1 | 2 | 3) => void;
}

const STEPS = [1, 2, 3] as const;

export function StepBar({ step, onStepChange }: StepBarProps) {
  const t = useTranslations('mailRouting.outbound.steps');

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="mr-ob-step-bar">
      {STEPS.map((s, idx) => {
        const isActive = s === step;
        const isDone = s < step;

        return (
          <div key={s} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onStepChange(s)}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                isActive && 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40',
                isDone &&
                  'border-green-300 bg-green-50 text-gray-700 dark:border-green-800 dark:bg-green-950/30',
                !isActive && !isDone && 'border-gray-200 text-gray-500 dark:border-gray-800',
              )}
              data-testid={`mr-ob-step-${s}`}
            >
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full text-xs',
                  isActive && 'bg-blue-600 text-white',
                  isDone && 'bg-green-600 text-white',
                  !isActive && !isDone && 'bg-gray-200 text-gray-600',
                )}
              >
                {isDone ? <Check className="h-3 w-3" /> : s}
              </span>
              {t(`step${s}Label` as 'step1Label' | 'step2Label' | 'step3Label')}
            </button>
            {idx < STEPS.length - 1 && <span className="text-gray-300">→</span>}
          </div>
        );
      })}
    </div>
  );
}
