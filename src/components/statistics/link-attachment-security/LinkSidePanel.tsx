'use client';

import type { Direction } from '@/lib/api/link-attachment-security';
import type { DistItem } from '@/lib/api/link-attachment-security';
import { LinkTypePieCard } from './LinkTypePieCard';
import { UrlReputationBarsCard } from './UrlReputationBarsCard';
import { TopMaliciousDomainsCard } from './TopMaliciousDomainsCard';

interface LinkSidePanelProps {
  typeDistribution?: DistItem[];
  reputationDistribution?: DistItem[];
  isLoading: boolean;
  startDate: string;
  endDate: string;
  direction: Direction;
}

export function LinkSidePanel({
  typeDistribution,
  reputationDistribution,
  isLoading,
  startDate,
  endDate,
  direction,
}: LinkSidePanelProps) {
  return (
    <div className="space-y-4" data-testid="link-side-panel">
      <LinkTypePieCard data={typeDistribution} isLoading={isLoading} />
      <UrlReputationBarsCard data={reputationDistribution} isLoading={isLoading} />
      <TopMaliciousDomainsCard startDate={startDate} endDate={endDate} direction={direction} />
    </div>
  );
}
