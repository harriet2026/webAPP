import { describe, expect, it } from 'vitest';
import zh from '../../messages/zh.json';
import en from '../../messages/en.json';
import th from '../../messages/th.json';
import ru from '../../messages/ru.json';

describe('GT-13673 behavior-control unique-recipient wording', () => {
  it.each([
    {
      locale: 'zh',
      messages: zh,
      dimension: '不重复收件人数上限',
      simulator: '测试不重复收件人数',
      exampleFragment: '500个不重复收件人',
    },
    {
      locale: 'en',
      messages: en,
      dimension: 'Max unique recipient count',
      simulator: 'Test Unique Recipient Count',
      exampleFragment: '500 unique recipients',
    },
    {
      locale: 'th',
      messages: th,
      dimension: 'จำนวนผู้รับที่ไม่ซ้ำกันสูงสุด',
      simulator: 'จำนวนผู้รับที่ไม่ซ้ำกันสำหรับการทดสอบ',
      exampleFragment: 'ผู้รับที่ไม่ซ้ำกัน 500 คน',
    },
    {
      locale: 'ru',
      messages: ru,
      dimension: 'Максимум уникальных получателей',
      simulator: 'Тестовое кол-во уникальных получателей',
      exampleFragment: '500 уникальным получателям',
    },
  ])('states the distinct-recipient metric consistently in $locale', ({
    messages, dimension, simulator, exampleFragment,
  }) => {
    expect(messages.behaviorControl.dim.recipient_count).toBe(dimension);
    expect(messages.behaviorControl.simulator.recipientCount).toBe(simulator);
    expect(messages.behaviorControl.examples.salesEffect).toContain(exampleFragment);
  });
});

describe('GT-13699 behavior-control attachment-size simulator wording', () => {
  it.each([
    { locale: 'zh', messages: zh, expected: '测试附件总大小' },
    { locale: 'en', messages: en, expected: 'Test Total Attachment Size' },
    { locale: 'th', messages: th, expected: 'ขนาดรวมของไฟล์แนบทดสอบ' },
    { locale: 'ru', messages: ru, expected: 'Общий размер тестовых вложений' },
  ])('labels the MiB input in $locale', ({ messages, expected }) => {
    expect(messages.behaviorControl.simulator.attachmentSize).toBe(expected);
    expect(messages.behaviorControl.simulator.unitAttachment).toMatch(/MB|МБ/);
  });
});
