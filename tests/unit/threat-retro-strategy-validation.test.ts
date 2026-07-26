import { describe, it, expect } from 'vitest';
import { makeStrategy, overlapWarn, validateStrategy } from '@/components/threat-retro/strategy/strategy-defaults';

describe('validateStrategy', () => {
  it('requires a name (<=50)', () => {
    const s = makeStrategy('deep');
    s.name = '';
    expect(validateStrategy(s).name).toBeTruthy();
    s.name = 'x'.repeat(51);
    expect(validateStrategy(s).name).toBeTruthy();
  });

  it('new strategies are deep-only and medium threshold is 70-89', () => {
    const s = makeStrategy();
    expect(s.mode).toBe('deep');
    s.name = 'deep';
    s.notify.medium.min_confidence = 90;
    expect(validateStrategy(s).confidence).toBeTruthy();
  });

  it('deep: requires >=1 run_time and lookback <=1440', () => {
    const s = makeStrategy('deep');
    s.schedule.run_times = [];
    s.lookback_window_minutes = 2000;
    const errs = validateStrategy(s);
    expect(errs.runTimes).toBeTruthy();
    expect(errs.lookback).toBeTruthy();
  });

  it('rejects invalid notify recipient emails', () => {
    const s = makeStrategy('deep');
    s.notify.recipients = ['not-an-email'];
    expect(validateStrategy(s).recipients).toBeTruthy();
  });

  it('rejects invalid exclusion tags and email addresses', () => {
    const s = makeStrategy('deep');
    s.name = 'exclusions';
    s.exclusions.exclude_rcpt_sys_tags = ['finance'];
    s.exclusions.exclude_email_list = ['not-an-email'];
    const errors = validateStrategy(s);
    expect(errors.exclusionTags).toBeTruthy();
    expect(errors.exclusionEmails).toBeTruthy();
  });

	it('matches backend numeric boundaries', () => {
	  const s = makeStrategy('deep');
	  s.name = 'bounds';
	  s.resource_limits.max_tool_calls = 0;
	  s.resource_limits.max_url_fetches = 0;
	  s.disposition.auto_confidence_threshold = 101;
	  s.disposition.decision_timeout_hours = 25;
	  s.disposition.max_recall_per_run = 0;
	  s.disposition.circuit_breaker_threshold = 100001;
	  const errors = validateStrategy(s);
	  expect(errors.maxToolCalls).toBeTruthy();
	  expect(errors.maxUrlFetches).toBeTruthy();
	  expect(errors.autoConfidence).toBeTruthy();
	  expect(errors.decisionTimeout).toBeTruthy();
	  expect(errors.maxRecall).toBeTruthy();
	  expect(errors.circuitBreaker).toBeTruthy();
	});

  it('a fully-filled strategy has no errors', () => {
    const s = makeStrategy('deep');
    s.name = 'ok';
    s.schedule.run_times = ['09:00'];
    expect(Object.keys(validateStrategy(s)).length).toBe(0);
  });
});

describe('overlapWarn', () => {
  it('warns (returns conflicting name) when a deep strategy shares a run_time', () => {
    const draft = makeStrategy('deep');
    draft.id = 1;
    draft.schedule.run_times = ['09:00', '18:00'];
    const existing = makeStrategy('deep');
    existing.id = 2;
    existing.name = '巡检-B';
    existing.schedule.run_times = ['18:00'];
    expect(overlapWarn(draft, [existing])).toBe('巡检-B');
  });

  it('returns null when run_times do not overlap', () => {
    const draft = makeStrategy('deep');
    draft.id = 1;
    draft.schedule.run_times = ['09:00'];
    const existing = makeStrategy('deep');
    existing.id = 2;
    existing.schedule.run_times = ['10:00'];
    expect(overlapWarn(draft, [existing])).toBeNull();
  });

  it('ignores the strategy itself and realtime strategies', () => {
    const draft = makeStrategy('deep');
    draft.id = 7;
    draft.schedule.run_times = ['09:00'];
    const self = makeStrategy('deep');
    self.id = 7; // same id → must not self-conflict
    self.schedule.run_times = ['09:00'];
    const realtime = makeStrategy('realtime'); // different mode → never conflicts
    realtime.id = 8;
    expect(overlapWarn(draft, [self, realtime])).toBeNull();
  });

  it('returns null for a realtime draft', () => {
    const draft = makeStrategy('realtime');
    draft.id = 1;
    const existing = makeStrategy('deep');
    existing.id = 2;
    existing.schedule.run_times = ['09:00'];
    expect(overlapWarn(draft, [existing])).toBeNull();
  });
});
