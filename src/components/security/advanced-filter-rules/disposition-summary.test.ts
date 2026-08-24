import { describe, it, expect } from 'vitest'
import { effectiveAddons, TERMINAL_ACTIONS } from './DispositionSummary'
import type { AddonsState } from './validation'
import type { AddonKey } from './conflict-matrix'

function value(keys: string[]): AddonsState {
  const state: AddonsState = {}
  for (const k of keys) {
    state[k as AddonKey] = { enabled: true, params: {} }
  }
  return state
}

describe('effectiveAddons', () => {
  it('drops detailedLog (no UI entry, excluded from the at-least-one rule)', () => {
    expect(effectiveAddons('accept', value(['detailedLog', 'disclaimer']))).toEqual(['disclaimer'])
  })

  it('drops conflict-disabled addons for quarantine', () => {
    expect(effectiveAddons('quarantine', value(['forwardServer', 'adminNotify']))).toEqual(['adminNotify'])
  })

  it('returns addons in UI_ADDON_KEYS order, not insertion order', () => {
    expect(effectiveAddons('accept', value(['modifyHeader', 'disclaimer']))).toEqual(['disclaimer', 'modifyHeader'])
  })

  it('marks discard as terminal', () => {
    expect(TERMINAL_ACTIONS.has('discard')).toBe(true)
    expect(TERMINAL_ACTIONS.has('quarantine')).toBe(false)
  })
})
