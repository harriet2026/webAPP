// 规则效能统计页面的时间范围换算——与安全总览的 date-range.ts 保持同一套换算规则
// （闭区间 days = end - start + 1），但本页时间范围枚举更简单（今天/近7天/近30天/自定义），
// 故独立维护一份轻量实现，不引入对安全总览模块内部状态的耦合。

import { format, subDays, differenceInCalendarDays, isValid, parse } from 'date-fns';
import type { TimeRange } from '@/lib/api/rule-effectiveness';

export const MAX_RANGE_DAYS = 366;

export interface CustomRange {
  start: string;
  end: string;
}

export type RangeError = 'invalid' | 'order' | 'tooLong' | null;

const LAYOUT = 'yyyy-MM-dd';

function parseDate(s: string): Date | null {
  if (!s) return null;
  const d = parse(s, LAYOUT, new Date());
  return isValid(d) ? d : null;
}

export function validateCustomRange({ start, end }: CustomRange): RangeError {
  const s = parseDate(start);
  const e = parseDate(end);
  if (!s || !e) return 'invalid';
  if (e < s) return 'order';
  if (differenceInCalendarDays(e, s) + 1 > MAX_RANGE_DAYS) return 'tooLong';
  return null;
}

export function defaultCustomRange(now: Date = new Date()): CustomRange {
  return {
    start: format(subDays(now, 6), LAYOUT),
    end: format(now, LAYOUT),
  };
}

export function timeRangeToDates(
  timeRange: TimeRange,
  custom: CustomRange,
  now: Date = new Date(),
): { startDate: string; endDate: string } {
  switch (timeRange) {
    case 'today':
      return { startDate: format(now, LAYOUT), endDate: format(now, LAYOUT) };
    case '7d':
      return { startDate: format(subDays(now, 6), LAYOUT), endDate: format(now, LAYOUT) };
    case '30d':
      return { startDate: format(subDays(now, 29), LAYOUT), endDate: format(now, LAYOUT) };
    case 'custom':
      return { startDate: custom.start, endDate: custom.end };
    default:
      return { startDate: format(subDays(now, 6), LAYOUT), endDate: format(now, LAYOUT) };
  }
}
