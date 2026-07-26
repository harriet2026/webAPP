'use client';

import { useTranslations } from 'next-intl';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Link2, ShieldX, Paperclip, ShieldAlert, TrendingDown, TrendingUp } from 'lucide-react';
import type { LinkAttachmentKPI } from '@/lib/api/link-attachment-security';
import {
  linkDetectionRateLevel,
  attachmentDetectionRateLevel,
  SEVERITY_TEXT_CLASS,
} from './colors';

interface KpiCardsProps {
  data?: LinkAttachmentKPI;
  isLoading: boolean;
  onCardClick?: (tab: 'link' | 'attachment') => void;
}

export function KpiCards({ data, isLoading, onCardClick }: KpiCardsProps) {
  const t = useTranslations('linkAttachmentSecurity');

  const cards = [
    {
      key: 'totalLinkMail',
      icon: Link2,
      value: data?.total_link_mail,
      format: (v: number) => v.toLocaleString(),
      accent: 'bg-blue-100 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300',
      onClick: () => onCardClick?.('link'),
    },
    {
      key: 'linkDetectionRate',
      icon: ShieldX,
      value: data?.link_detection_rate,
      format: (v: number) => `${v.toFixed(1)}%`,
      accent: 'bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-300',
      trendIcon: TrendingUp,
      onClick: () => onCardClick?.('link'),
      colorFn: (v: number) => SEVERITY_TEXT_CLASS[linkDetectionRateLevel(v)],
    },
    {
      key: 'totalAttachmentMail',
      icon: Paperclip,
      value: data?.total_attachment_mail,
      format: (v: number) => v.toLocaleString(),
      accent: 'bg-purple-100 text-purple-600 dark:bg-purple-950/50 dark:text-purple-300',
      onClick: () => onCardClick?.('attachment'),
    },
    {
      key: 'attachmentDetectionRate',
      icon: ShieldAlert,
      value: data?.attachment_detection_rate,
      format: (v: number) => `${v.toFixed(1)}%`,
      accent: 'bg-orange-100 text-orange-600 dark:bg-orange-950/50 dark:text-orange-300',
      trendIcon: TrendingDown,
      onClick: () => onCardClick?.('attachment'),
      colorFn: (v: number) => SEVERITY_TEXT_CLASS[attachmentDetectionRateLevel(v)],
    },
  ];

  return (
    <div className="grid gap-4 bg-white md:grid-cols-2 lg:grid-cols-4 dark:bg-gray-950" data-testid="link-attachment-kpis">
      {cards.map((card) => {
        const Icon = card.icon;
        const TrendIcon = card.trendIcon;
        const displayValue = data ? card.format(card.value ?? 0) : null;
        const valueColorClass = data && card.colorFn ? card.colorFn(card.value ?? 0) : '';

        return (
          <Card
            key={card.key}
            className="h-[130px] cursor-pointer gap-0 bg-card py-0 transition-shadow hover:shadow-md"
            onClick={card.onClick}
            data-testid={`kpi-${card.key}`}
          >
            <CardHeader className="flex h-[130px] translate-y-2 flex-row items-center justify-between space-y-0 p-6">
              <div>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t(`kpi.${card.key}`)}
                </CardTitle>
                {isLoading ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  <div className="mt-1 flex items-center gap-2">
                    <span className={`text-2xl font-bold tracking-tight ${valueColorClass}`}>
                    {displayValue}
                    </span>
                    {TrendIcon && <TrendIcon className={`h-4 w-4 ${card.key === 'linkDetectionRate' ? 'text-danger' : 'text-success'}`} />}
                  </div>
                )}
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger
                    render={<div className={`flex h-12 w-12 items-center justify-center rounded-full ${card.accent}`} />}
                  >
                    <Icon className="h-6 w-6" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t(`kpi.tooltips.${card.key}Help` as Parameters<typeof t>[0])}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardHeader>
          </Card>
        );
      })}
    </div>
  );
}
