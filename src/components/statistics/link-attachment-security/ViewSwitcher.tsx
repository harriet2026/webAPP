'use client';

import { useTranslations } from 'next-intl';
import { Link2, Paperclip } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ViewSwitcherProps {
  value: 'link' | 'attachment';
  onChange: (v: 'link' | 'attachment') => void;
}

export function ViewSwitcher({ value, onChange }: ViewSwitcherProps) {
  const t = useTranslations('linkAttachmentSecurity');

  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as 'link' | 'attachment')}>
      <TabsList>
        <TabsTrigger value="link"><Link2 className="h-4 w-4" />{t('tabs.link')}</TabsTrigger>
        <TabsTrigger value="attachment"><Paperclip className="h-4 w-4" />{t('tabs.attachment')}</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
