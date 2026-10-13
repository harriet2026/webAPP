'use client';

import { Switch } from '@/components/ui/switch';

export function ObservationModeControl({ checked, onChange, testId, title, description }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  testId: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-indigo-950 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-100">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-indigo-800 dark:text-indigo-200">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} data-testid={testId} aria-label={title} />
    </div>
  );
}
