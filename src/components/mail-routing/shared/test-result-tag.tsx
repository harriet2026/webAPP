'use client';

// 连通性测试结果标签：idle 不渲染，loading/ok/fail 三态文案固定。对齐
// doc/html-spec/admin-forwarding/index.html §2.7「TestResultTag：连通性测试三态：
// loading=Loader2 旋转+「测试中…」；ok=绿 CheckCircle2+「连通正常」；
// fail=红 XCircle+「连接失败：超时」（失败原因文案写死为超时）」。

import { useTranslations } from 'next-intl';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import type { TestState } from '../mr-types';

export function TestResultTag({ state, testId }: { state: TestState; testId: string }) {
  const t = useTranslations('mailRouting.shared');
  if (state === 'idle') return null;
  if (state === 'loading') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-500" data-testid={testId}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {t('testing')}
      </span>
    );
  }
  if (state === 'ok') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-600" data-testid={testId}>
        <CheckCircle2 className="h-3.5 w-3.5" />
        {t('testOk')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-red-600" data-testid={testId}>
      <XCircle className="h-3.5 w-3.5" />
      {t('testFail')}
    </span>
  );
}
