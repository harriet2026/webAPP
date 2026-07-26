'use client';

import type { Direction } from '@/lib/api/link-attachment-security';
import type { DistItem } from '@/lib/api/link-attachment-security';
import { AttachmentTypePieCard } from './AttachmentTypePieCard';
import { AttachmentThreatTypePieCard } from './AttachmentThreatTypePieCard';
import { TopMaliciousAttachmentsCard } from './TopMaliciousAttachmentsCard';

interface AttachmentSidePanelProps {
  typeDistribution?: DistItem[];
  threatTypeDistribution?: DistItem[];
  isLoading: boolean;
  startDate: string;
  endDate: string;
  direction: Direction;
}

export function AttachmentSidePanel({
  typeDistribution,
  threatTypeDistribution,
  isLoading,
  startDate,
  endDate,
  direction,
}: AttachmentSidePanelProps) {
  return (
    <div className="space-y-4" data-testid="attachment-side-panel">
      <AttachmentTypePieCard data={typeDistribution} isLoading={isLoading} />
      <AttachmentThreatTypePieCard data={threatTypeDistribution} isLoading={isLoading} />
      <TopMaliciousAttachmentsCard startDate={startDate} endDate={endDate} direction={direction} />
    </div>
  );
}
