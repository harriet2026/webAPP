'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { DisplayNameSpoofConfig, InternalUser, CheckItem } from '@/types/auth-spoofing';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { CheckItemRow } from './CheckItemRow';
import { ChevronDown, Plus, X, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

const DIRECTION_KEYS: { key: keyof Pick<DisplayNameSpoofConfig, 'inbound' | 'outbound' | 'internal'>; labelKey: string }[] = [
  { key: 'inbound', labelKey: 'displayNameSpoof.inbound' },
  { key: 'outbound', labelKey: 'displayNameSpoof.outbound' },
  { key: 'internal', labelKey: 'displayNameSpoof.internal' },
];

interface DisplayNameSpoofSectionProps {
  config: DisplayNameSpoofConfig;
  onChange: (config: DisplayNameSpoofConfig) => void;
  disabled?: boolean;
}

export function DisplayNameSpoofSection({ config, onChange, disabled }: DisplayNameSpoofSectionProps) {
  const t = useTranslations('authSpoofing');
  const [open, setOpen] = useState(true);
  const [activeTab, setActiveTab] = useState('inbound');
  const [newUserName, setNewUserName] = useState('');
  const [newUserMode, setNewUserMode] = useState<'exact' | 'substring'>('exact');

  const handleDirectionChange = (key: 'inbound' | 'outbound' | 'internal', item: CheckItem) => {
    onChange({ ...config, [key]: item });
  };

  const handleAddUser = () => {
    const name = newUserName.trim();
    if (!name) return;
    const user: InternalUser = { name, match_mode: newUserMode };
    onChange({ ...config, internal_users: [...(config.internal_users || []), user] });
    setNewUserName('');
  };

  const handleRemoveUser = (index: number) => {
    const users = [...(config.internal_users || [])];
    users.splice(index, 1);
    onChange({ ...config, internal_users: users });
  };

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="pb-3">
          <CollapsibleTrigger
            render={
              <button
                type="button"
                className="flex items-center gap-2 cursor-pointer w-full text-left bg-transparent border-0 p-0"
              >
                <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
                <CardTitle className="text-base font-semibold">{t('displayNameSpoof.title')}</CardTitle>
              </button>
            }
          />
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-4 pt-0">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                {DIRECTION_KEYS.map((d) => (
                  <TabsTrigger key={d.key} value={d.key}>
                    {t(d.labelKey as any)}
                  </TabsTrigger>
                ))}
              </TabsList>

              {DIRECTION_KEYS.map((d) => (
                <TabsContent key={d.key} value={d.key}>
                  <div className="pt-2">
                    <CheckItemRow
                      label={t(d.labelKey as any)}
                      item={config[d.key]}
                      onChange={(item) => handleDirectionChange(d.key, item)}
                      disabled={disabled}
                    />
                  </div>
                </TabsContent>
              ))}
            </Tabs>

            <div className="space-y-3">
              <div className="text-sm font-medium">{t('displayNameSpoof.internalUsers')}</div>

              {(!config.internal_users || config.internal_users.length === 0) && (
                <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-amber-800 dark:text-amber-200">
                    {t('displayNameSpoof.emptyUsersWarning')}
                  </AlertDescription>
                </Alert>
              )}

              {(config.internal_users || []).map((user, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border p-2">
                  <span className="text-sm flex-1 font-mono">{user.name}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {t(`displayNameSpoof.${user.match_mode}` as any)}
                  </Badge>
                  <Button variant="ghost" size="icon-sm" onClick={() => handleRemoveUser(i)} disabled={disabled}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}

              <div className="flex items-center gap-2">
                <Input
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder={t('displayNameSpoof.userNamePlaceholder')}
                  className="flex-1"
                  disabled={disabled}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddUser(); } }}
                />
                <Select value={newUserMode} onValueChange={(v) => setNewUserMode(v as 'exact' | 'substring')}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue>{{ exact: t('displayNameSpoof.exact'), substring: t('displayNameSpoof.substring') }[newUserMode]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="exact">{t('displayNameSpoof.exact')}</SelectItem>
                    <SelectItem value="substring">{t('displayNameSpoof.substring')}</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={handleAddUser} disabled={disabled || !newUserName.trim()}>
                  <Plus className="h-4 w-4 mr-1" />
                  {t('displayNameSpoof.addUser')}
                </Button>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}


