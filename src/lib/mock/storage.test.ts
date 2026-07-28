import { beforeEach, describe, expect, it } from 'vitest';
import {
  isDemoSessionEnabled,
  isMockEnabled,
  setDemoSessionEnabled,
  setMockEnabled,
} from './storage';

describe('mock and demo session storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('keeps demo-session state separate from the mock-data toggle', () => {
    setDemoSessionEnabled(true);

    expect(isDemoSessionEnabled()).toBe(true);
    expect(isMockEnabled()).toBe(false);

    setMockEnabled(true);
    setDemoSessionEnabled(false);

    expect(isDemoSessionEnabled()).toBe(false);
    expect(isMockEnabled()).toBe(true);
  });
});
