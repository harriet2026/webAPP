import { describe, expect, it } from 'vitest';
import { defaultConfig, DIRECTIONS, SIMILARITY_DEFAULT } from '@/components/security/similar-detection/defaults';

describe('similar-detection defaultConfig（demo 运行态默认值）', () => {
  it('DIRECTIONS 固定为 receive/send/internal', () => {
    expect(DIRECTIONS).toEqual(['receive', 'send', 'internal']);
  });

  it('SIMILARITY_DEFAULT = 80', () => {
    expect(SIMILARITY_DEFAULT).toBe(80);
  });

  it('mode=separate，三方向全部启用', () => {
    const cfg = defaultConfig();
    expect(cfg.mode).toBe('separate');
    expect(cfg.enabled_directions).toEqual(['receive', 'send', 'internal']);
    expect(cfg.version).toBe(0);
  });

  it('similar_email.internal = accept + 主题前缀标记 "[相似邮件]"', () => {
    const cfg = defaultConfig();
    const internal = cfg.similar_email.internal;
    expect(internal.action).toBe('accept');
    expect(internal.tag_subject_enabled).toBe(true);
    expect(internal.tag_subject_position).toBe('prefix');
    expect(internal.tag_subject_content).toBe('[相似邮件]');
    expect(internal.window_minutes).toBe(30);
    expect(internal.similarity_pct).toBe(80);
    expect(internal.min_count).toBe(10);
  });

  it('similar_email.receive 开启观察模式，send/internal 不开启', () => {
    const cfg = defaultConfig();
    expect(cfg.similar_email.receive.observe_mode).toBe(true);
    expect(cfg.similar_email.send.observe_mode).toBe(false);
    expect(cfg.similar_email.internal.observe_mode).toBe(false);
  });

  it('same_subject：receive/send 观察模式开启，send 动作为 audit，receive/internal 为 quarantine', () => {
    const cfg = defaultConfig();
    expect(cfg.same_subject.receive.observe_mode).toBe(true);
    expect(cfg.same_subject.receive.action).toBe('quarantine');
    expect(cfg.same_subject.send.observe_mode).toBe(true);
    expect(cfg.same_subject.send.action).toBe('audit');
    expect(cfg.same_subject.internal.observe_mode).toBe(false);
    expect(cfg.same_subject.internal.action).toBe('quarantine');
    expect(cfg.same_subject.receive.window_minutes).toBe(60);
    expect(cfg.same_subject.receive.similarity_pct).toBe(90);
    expect(cfg.same_subject.receive.min_count).toBe(50);
  });

  it('aggregate = quarantine，不开观察模式', () => {
    const cfg = defaultConfig();
    expect(cfg.aggregate.action).toBe('quarantine');
    expect(cfg.aggregate.observe_mode).toBe(false);
    expect(cfg.aggregate.window_minutes).toBe(30);
    expect(cfg.aggregate.similarity_pct).toBe(80);
    expect(cfg.aggregate.min_count).toBe(10);
  });

  it('subject_normalization：忽略大小写+忽略Re前缀开启，忽略数字关闭，相似主题开启', () => {
    const cfg = defaultConfig();
    expect(cfg.subject_normalization).toEqual({
      ignore_case: true,
      ignore_re_prefix: true,
      ignore_numbers: false,
      similar_subject: true,
    });
  });

  it('每次调用返回新对象（不共享引用）', () => {
    const a = defaultConfig();
    const b = defaultConfig();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(a.similar_email).not.toBe(b.similar_email);
  });
});
