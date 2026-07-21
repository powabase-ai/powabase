import { describe, expect, test } from 'vitest'

import {
  POWABASE_PLANS,
  POWABASE_PLAN_ORDER,
  planRank,
} from '@/data/billing/powabase-plans.constants'

describe('powabase-plans.constants', () => {
  test('orders tiers free → self-serve → scale', () => {
    expect(POWABASE_PLAN_ORDER).toEqual(['free', 'self-serve', 'scale'])
  })

  test('planRank ranks tiers and defaults unknown to 0', () => {
    expect(planRank('free')).toBe(0)
    expect(planRank('self-serve')).toBe(1)
    expect(planRank('scale')).toBe(2)
    expect(planRank('mystery')).toBe(0)
  })

  test('self-serve is flagged popular; every plan has a price + features', () => {
    expect(POWABASE_PLANS['self-serve'].popular).toBe(true)
    for (const id of POWABASE_PLAN_ORDER) {
      expect(POWABASE_PLANS[id].monthlyPriceLabel).toMatch(/\$\d/)
      expect(POWABASE_PLANS[id].features.length).toBeGreaterThan(0)
    }
  })

  test('plan prices match Decision #37 ($25/$300; no +$25 bonus)', () => {
    expect(POWABASE_PLANS['self-serve'].monthlyPriceLabel).toBe('$25/mo')
    expect(POWABASE_PLANS['self-serve'].creditLabel).toBe('$25 monthly credits — spend on anything')
    expect(POWABASE_PLANS['scale'].monthlyPriceLabel).toBe('$300/mo')
    expect(POWABASE_PLANS['scale'].creditLabel).toBe('$300 monthly credits — spend on anything')
    // Free creditLabel must NOT carry the +$25 bonus (unimplemented in BE)
    expect(POWABASE_PLANS['free'].creditLabel).not.toContain('+$25')
    expect(POWABASE_PLANS['free'].creditLabel).toBe('$10 free credits on sign-up')
  })

  test('plan copy never implies per-token / LLM billing (BYOK invariant)', () => {
    // Hard rule (CLAUDE.md): we never bill LLM tokens — users bring their own keys.
    // Pin it so a future copy edit can't silently violate it.
    const forbidden = /per[- ]?token|per[- ]?(input|output)|llm (cost|usage|token)|tokens? billed/i
    for (const id of POWABASE_PLAN_ORDER) {
      const plan = POWABASE_PLANS[id]
      const copy = [plan.name, plan.monthlyPriceLabel, plan.creditLabel, ...plan.features].join('\n')
      expect(copy).not.toMatch(forbidden)
    }
  })
})
