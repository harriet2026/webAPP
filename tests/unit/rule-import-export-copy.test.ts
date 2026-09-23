import { describe, expect, it } from 'vitest';
import zh from '../../messages/zh.json';
import en from '../../messages/en.json';
import th from '../../messages/th.json';
import ru from '../../messages/ru.json';

describe('GT-13695 rule import/export wording', () => {
  it.each([
    { locale: 'zh', messages: zh, button: '导出文件', ready: '导出已开始，请在浏览器下载记录中查看文件' },
    { locale: 'en', messages: en, button: 'Export file', ready: "Export started. Check your browser's downloads for the file." },
    { locale: 'th', messages: th, button: 'ส่งออกไฟล์', ready: 'เริ่มส่งออกแล้ว โปรดตรวจสอบไฟล์ในการดาวน์โหลดของเบราว์เซอร์' },
    { locale: 'ru', messages: ru, button: 'Экспортировать файл', ready: 'Экспорт начат. Найдите файл в загрузках браузера.' },
  ])('uses accurate export actions in $locale', ({ messages, button, ready }) => {
    expect(messages.ruleImportExport.dialog.description).toContain('{scopeLabel}');
    expect(messages.ruleImportExport.dialog.exportButton).toBe(button);
    expect(messages.ruleImportExport.dialog.toast.exportReady).toBe(ready);
  });
});
