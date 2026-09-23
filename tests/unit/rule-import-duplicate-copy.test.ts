import { describe, expect, it } from 'vitest';
import zh from '../../messages/zh.json';
import en from '../../messages/en.json';
import th from '../../messages/th.json';
import ru from '../../messages/ru.json';

describe('GT-13687 rule import duplicate numbering', () => {
  it.each([
    { locale: 'zh', messages: zh, copy: '第 {itemNumber} 条重复项将被跳过' },
    {
      locale: 'en',
      messages: en,
      copy: 'Duplicate item {itemNumber} will be skipped',
    },
    {
      locale: 'th',
      messages: th,
      copy: 'ระบบจะข้ามรายการซ้ำลำดับที่ {itemNumber}',
    },
    {
      locale: 'ru',
      messages: ru,
      copy: 'Повторяющийся элемент № {itemNumber} будет пропущен',
    },
  ])('uses a one-based display number in $locale', ({ messages, copy }) => {
    const message = messages.ruleImportExport.dialog.duplicateWillBeSkipped;
    expect(message).toBe(copy);
    expect(message).toContain('{itemNumber}');
    expect(message).not.toContain('{previewItemId}');
  });
});
