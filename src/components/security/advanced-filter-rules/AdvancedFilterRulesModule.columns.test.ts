import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import zh from '../../../../messages/zh.json';
import en from '../../../../messages/en.json';
import th from '../../../../messages/th.json';
import ru from '../../../../messages/ru.json';

const source = readFileSync(resolve(__dirname, 'AdvancedFilterRulesModule.tsx'), 'utf8');

describe('AdvancedFilterRulesModule rule identity columns (GT-13288)', () => {
  it('renders rule ID and priority as separate columns', () => {
    expect(source).toContain("<TableHead className=\"w-[70px]\">{t('ruleId')}</TableHead>");
    expect(source).toContain('<TableCell className="font-mono text-sm">{rule.id}</TableCell>');
    expect(source).toContain('data-testid={`rule-row-priority-${rule.id}`}');
    expect(source).toContain('{rule.priority}');
  });

  it('provides an explicit Rule ID heading in every locale', () => {
    expect(zh.advancedRulesFeature.ruleId).toBe('规则ID');
    expect(en.advancedRulesFeature.ruleId).toBe('Rule ID');
    expect(th.advancedRulesFeature.ruleId).toBe('รหัสกฎ');
    expect(ru.advancedRulesFeature.ruleId).toBe('ID правила');
  });
});
