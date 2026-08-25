'use client';

import { useTranslations } from 'next-intl';
import { formatTimestamp } from '@/lib/format-time';
import Link from 'next/link';
import { Globe, User, Server, Mail, Edit, Trash2, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { BehaviorControlRuleView, BehaviorObjectType, BehaviorDirection, BehaviorProductAction } from '@/types/behavior-control';
import { BACKEND_TO_PRODUCT } from '@/types/behavior-control';

interface Props {
  views: BehaviorControlRuleView[];
  onEdit: (view: BehaviorControlRuleView) => void;
  onDelete: (view: BehaviorControlRuleView) => void;
  onToggle: (id: number, isActive: boolean) => void;
}

const DIR_BADGE: Record<BehaviorDirection, string> = {
  inbound: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200',
  outbound: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200',
  internal: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-200',
  bidirectional: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200',
};

const ACTION_BADGE: Record<BehaviorProductAction, string> = {
  audit: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200',
  quarantine: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-200',
  discard: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200',
  reject: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200',
};

function ObjectCell({ type, subType, value }: { type: BehaviorObjectType; subType?: string; value?: string }) {
  const t = useTranslations();
  // demo getObjectTypeIcon: 图标只按对象类型区分（发信人一律 User），颜色 gray/blue/green/purple
  const Icon = type === 'global' ? Globe : type === 'sender' ? User : type === 'senderIp' ? Server : Mail;
  const iconColor = type === 'global' ? 'text-gray-500'
    : type === 'sender' ? 'text-blue-500'
    : type === 'senderIp' ? 'text-green-500'
    : 'text-purple-500';
  const label = type === 'global' ? t('behaviorControl.object.global') : (value ?? '');
  // demo 徽标：全局→全局；发信人→个人/群组/组织(子类型)；发信IP→发信IP；发信域名→发信域名
  const badge = type === 'global' ? t('behaviorControl.object.global')
    : type === 'sender' ? t(`behaviorControl.subType.${subType}`)
    : type === 'senderIp' ? t('behaviorControl.object.senderIp')
    : t('behaviorControl.object.senderDomain');
  return (
    <div className="flex items-center gap-2">
      <Icon className={`h-4 w-4 ${iconColor}`} />
      <span className="font-mono text-sm">{label}</span>
      <Badge variant="secondary" className="text-xs">{badge}</Badge>
    </div>
  );
}

export function BehaviorControlTable({ views, onEdit, onDelete, onToggle }: Props) {
  const t = useTranslations();

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 dark:bg-gray-900">
            <TableHead className="w-[90px]">{t('behaviorControl.col.id')}</TableHead>
            <TableHead className="min-w-[180px]">{t('behaviorControl.col.name')}</TableHead>
            <TableHead className="w-[110px]">{t('behaviorControl.col.direction')}</TableHead>
            <TableHead className="min-w-[220px]">{t('behaviorControl.col.object')}</TableHead>
            <TableHead className="w-[90px]">{t('behaviorControl.col.action')}</TableHead>
            <TableHead className="w-[80px]">{t('behaviorControl.col.priority')}</TableHead>
            <TableHead className="w-[80px]">{t('behaviorControl.col.status')}</TableHead>
            <TableHead className="w-[130px]">{t('behaviorControl.col.modified')}</TableHead>
            <TableHead className="w-[100px]">{t('behaviorControl.col.operations')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {views.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="h-32 text-center">
                <div className="text-muted-foreground">{t('behaviorControl.empty')}</div>
                <p className="text-sm text-muted-foreground">{t('behaviorControl.emptyHint')}</p>
              </TableCell>
            </TableRow>
          ) : views.map((v) => {
            const productAction = BACKEND_TO_PRODUCT[v.rule.action as keyof typeof BACKEND_TO_PRODUCT] ?? v.rule.action;
            return (
              <TableRow key={v.rule.id}>
                <TableCell className="font-mono text-xs text-muted-foreground">{v.list_id_display}</TableCell>
                <TableCell className="font-medium">
                  {v.is_complex && (
                    <span className="inline-flex items-center gap-1 mr-2 text-amber-600">
                      <AlertTriangle className="h-3 w-3" />
                      <span className="text-xs">{t('behaviorControl.complexRule')}</span>
                    </span>
                  )}
                  {v.rule.name}
                </TableCell>
                <TableCell>
                  {v.meta && (
                    <Badge className={DIR_BADGE[v.meta.direction]}>
                      {t(`behaviorControl.direction.${v.meta.direction}`)}
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {v.meta && <ObjectCell type={v.meta.object_config.type as BehaviorObjectType} subType={v.meta.object_config.sub_type as string | undefined} value={v.meta.object_config.value} />}
                </TableCell>
                <TableCell>
                  <Badge className={ACTION_BADGE[productAction as BehaviorProductAction]}>{t(`behaviorControl.action.${productAction}`)}</Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">{v.rule.priority}</TableCell>
                <TableCell>
                  <Switch
                    checked={v.rule.is_active}
                    onCheckedChange={(isActive) => onToggle(v.rule.id, isActive)}
                    aria-label={t(v.rule.is_active ? 'common.disabled' : 'common.enabled')}
                  />
                </TableCell>
                {/* GT-12500：本地时区分钟精度，不再裸渲染 UTC ISO 串 */}
                <TableCell className="text-sm text-muted-foreground">{formatTimestamp(v.rule.updated_at)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {v.is_complex ? (
                      <Link href={`/rules/action/${v.rule.id}`} className="inline-flex"><Button variant="ghost" size="sm"><Edit className="h-4 w-4" /></Button></Link>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => onEdit(v)}><Edit className="h-4 w-4" /></Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => onDelete(v)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
