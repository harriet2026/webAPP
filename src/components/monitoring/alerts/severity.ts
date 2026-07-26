import type { AlertSeverity, AlertStatus } from '@/types/alerts';

export const SEVERITY_CONFIG: Record<AlertSeverity, { key: string; badge: string; bgTint: string }> = {
  p0: { key: 'critical', badge: 'bg-red-500 text-white', bgTint: 'bg-red-50 dark:bg-red-900/20' },
  p1: { key: 'major', badge: 'bg-orange-500 text-white', bgTint: 'bg-orange-50 dark:bg-orange-900/20' },
  p2: { key: 'minor', badge: 'bg-yellow-500 text-white', bgTint: 'bg-yellow-50 dark:bg-yellow-900/20' },
  p3: { key: 'warning', badge: 'bg-blue-500 text-white', bgTint: 'bg-blue-50 dark:bg-blue-900/20' },
  p4: { key: 'info', badge: 'bg-gray-400 text-white', bgTint: 'bg-gray-50 dark:bg-gray-800' },
};

export const STATUS_CONFIG: Record<AlertStatus, string> = {
  unconfirmed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  confirmed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  processing: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  resolved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
};
