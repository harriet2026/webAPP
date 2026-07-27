import { describe, expect, it } from 'vitest';
import zh from '../../messages/zh.json';
import en from '../../messages/en.json';
import th from '../../messages/th.json';
import ru from '../../messages/ru.json';

const DIMENSION_KEYS = [
  'dimConnection',
  'dimAuth',
  'dimSendIp',
  'dimSubject',
  'dimSender',
  'dimRecipient',
] as const;

describe('Ops TOP dimension locale labels', () => {
  it.each([
    ['zh', zh, ['连接会话', '发信认证', '发信IP', '高危主题', '发信地址', '收件对象']],
    ['en', en, ['Connection', 'Auth', 'Send IP', 'Subject', 'Sender', 'Recipient']],
    ['th', th, ['การเชื่อมต่อ', 'การยืนยันตัวตน', 'IP ที่ส่ง', 'หัวเรื่อง', 'ผู้ส่ง', 'ผู้รับ']],
    ['ru', ru, ['Подключения', 'Аутентификация', 'IP отправителя', 'Тема', 'Отправитель', 'Получатель']],
  ] as const)('%s uses the reviewed dimension terminology', (_locale, messages, expected) => {
    expect(DIMENSION_KEYS.map((key) => messages.opsTopTrend[key])).toEqual(expected);
  });
});
