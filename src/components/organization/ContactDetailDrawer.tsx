'use client';

// 人员详情抽屉 —— 逐字段对齐 demo contact-book-tab.tsx 的详情 Sheet：
// 标题「人员详情」+ 描述、两列信息网格（用户名/职务/数据源/当前标记 +
// 整行 主邮箱/部门路径/邮箱别名）、关联策略卡（三行条件渲染）、无底部按钮。

import { useTranslations } from 'next-intl';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import type { Contact } from './types';

interface ContactDetailDrawerProps {
  contact: Contact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ContactDetailDrawer({ contact, open, onOpenChange }: ContactDetailDrawerProps) {
  const t = useTranslations('organizationContacts');
  if (!contact) return null;

  const tagLabel =
    contact.tag === 'executive' ? t('tagExecutive') : contact.tag === 'key_position' ? t('tagKeyPosition') : t('detailNoTag');
  // 邮箱别名：后端暂无该字段（mock fixture 按 demo 公式提供 email_alias）
  const alias = typeof (contact as Record<string, unknown>).email_alias === 'string'
    ? String((contact as Record<string, unknown>).email_alias)
    : '-';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-xl" showCloseButton data-testid="contacts-book-detail">
        <SheetHeader className="border-b border-gray-100 px-6 pb-3 pt-6 dark:border-gray-800">
          <SheetTitle>{t('detailTitle')}</SheetTitle>
          <SheetDescription>{t('detailDesc')}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-2 gap-y-3 text-sm">
            <DetailRow label={t('detailUsername')} value={contact.display_name || contact.email} data-testid="contacts-book-detail-username" />
            <DetailRow label={t('detailPosition')} value={contact.job_title || '-'} data-testid="contacts-book-detail-position" />
            <DetailRow label={t('detailSource')} value={contact.source_name || '-'} data-testid="contacts-book-detail-source" />
            <DetailRow label={t('detailCurrentTag')} value={tagLabel} data-testid="contacts-book-detail-tag" />
            <div className="col-span-2">
              <DetailRow label={t('detailPrimaryEmail')} value={contact.email} data-testid="contacts-book-detail-email" />
            </div>
            <div className="col-span-2">
              <DetailRow label={t('detailDeptPath')} value={contact.department_path || '-'} data-testid="contacts-book-detail-dept" />
            </div>
            <div className="col-span-2">
              <DetailRow label={t('detailAlias')} value={alias} data-testid="contacts-book-detail-alias" />
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800" data-testid="contacts-book-detail-policies">
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">{t('relatedPolicies')}</h4>
            <ul className="mt-2 space-y-1.5 text-sm text-gray-600 dark:text-gray-400">
              <li>{t('policyExecProtect', { state: contact.tag === 'executive' ? t('stateInPool') : t('stateNotInPool') })}</li>
              <li>
                {t('policyImpersonation', {
                  state: contact.tag === 'executive' || contact.tag === 'key_position' ? t('stateKeyTarget') : t('stateNormalTarget'),
                })}
              </li>
              <li>{t('policyRecipientCheck')}</li>
            </ul>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DetailRow({ label, value, 'data-testid': testId }: { label: string; value: string; 'data-testid'?: string }) {
  return (
    <div data-testid={testId}>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="mt-0.5 text-gray-800 dark:text-gray-200">{value}</p>
    </div>
  );
}
