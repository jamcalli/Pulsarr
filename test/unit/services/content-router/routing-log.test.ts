import {
  failedSentence,
  heldSentence,
  joinNames,
  type RoutingNames,
  sentSentence,
  skippedSentence,
  syncedSentence,
} from '@services/content-router/routing-log.js'
import { describe, expect, it } from 'vitest'

const names: RoutingNames = {
  title: 'Suspiria',
  user: 'jay (Jayman)',
  instanceNames: new Map([
    [1, 'Radarr NZB'],
    [2, 'Radarr 4K'],
    [3, 'Radarr Kids'],
  ]),
}

describe('joinNames', () => {
  it('joins one, two and three names', () => {
    expect(joinNames([])).toBe('')
    expect(joinNames(['A'])).toBe('A')
    expect(joinNames(['A', 'B'])).toBe('A and B')
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B and C')
  })
})

describe('sentSentence', () => {
  it('names the rule that decided', () => {
    expect(sentSentence(names, 1, 'Horror 4K')).toBe(
      '"Suspiria" for jay (Jayman) sent to Radarr NZB via rule "Horror 4K"',
    )
  })

  it('calls out the default route', () => {
    expect(sentSentence(names, 1, undefined)).toBe(
      '"Suspiria" for jay (Jayman) sent to Radarr NZB, default route',
    )
  })

  it('falls back to the id for an unknown instance', () => {
    expect(sentSentence(names, 9, undefined)).toBe(
      '"Suspiria" for jay (Jayman) sent to instance 9, default route',
    )
  })
})

describe('syncedSentence', () => {
  it('names the source instance when known', () => {
    expect(syncedSentence(names, 2, 1)).toBe(
      '"Suspiria" for jay (Jayman) synced to Radarr 4K from Radarr NZB',
    )
    expect(syncedSentence(names, 2, undefined)).toBe(
      '"Suspiria" for jay (Jayman) synced to Radarr 4K',
    )
  })
})

describe('heldSentence', () => {
  it('describes each hold reason', () => {
    expect(
      heldSentence(names, { reason: 'rule', ruleId: 4, ruleName: 'Kids' }),
    ).toBe(
      '"Suspiria" for jay (Jayman) held for approval, rule "Kids" requires approval',
    )
    expect(heldSentence(names, { reason: 'user' })).toBe(
      '"Suspiria" for jay (Jayman) held for approval, user requires approval',
    )
  })

  it('formats the quota period from the quota type and window', () => {
    const quota = (quotaType: 'daily' | 'weekly_rolling' | 'monthly') =>
      heldSentence(names, {
        reason: 'quota',
        quotaType,
        used: 4,
        limit: 3,
        weeklyRollingDays: 7,
      })
    expect(quota('daily')).toBe(
      '"Suspiria" for jay (Jayman) held for approval, over quota (4 of 3 today)',
    )
    expect(quota('weekly_rolling')).toBe(
      '"Suspiria" for jay (Jayman) held for approval, over quota (4 of 3 in the last 7 days)',
    )
    expect(quota('monthly')).toBe(
      '"Suspiria" for jay (Jayman) held for approval, over quota (4 of 3 this month)',
    )
  })
})

describe('skippedSentence', () => {
  it('describes each skip reason', () => {
    const skipped = '"Suspiria" for jay (Jayman) skipped'
    expect(
      skippedSentence(names, { reason: 'present', instanceIds: [1, 2] }),
    ).toBe(`${skipped}, already in Radarr NZB and Radarr 4K`)
    expect(
      skippedSentence(names, { reason: 'excluded', instanceIds: [3] }),
    ).toBe(`${skipped}, excluded in Radarr Kids`)
    expect(skippedSentence(names, { reason: 'on-plex' })).toBe(
      `${skipped}, already on Plex`,
    )
    expect(skippedSentence(names, { reason: 'pending' })).toBe(
      `${skipped}, approval already pending`,
    )
    expect(skippedSentence(names, { reason: 'rejected' })).toBe(
      `${skipped}, previously rejected`,
    )
    expect(
      skippedSentence(names, { reason: 'skip-rule', ruleName: 'No Kids' }),
    ).toBe(`${skipped} by rule "No Kids"`)
    expect(skippedSentence(names, { reason: 'no-instance' })).toBe(
      `${skipped}, no instance available`,
    )
    expect(
      skippedSentence(names, {
        reason: 'routed-elsewhere',
        instanceId: 2,
        ruleInstanceIds: [1, 3],
      }),
    ).toBe(
      `${skipped} sync to Radarr 4K, rules route it to Radarr NZB and Radarr Kids`,
    )
    expect(
      skippedSentence(names, { reason: 'no-rule-match', instanceId: 2 }),
    ).toBe(`${skipped} sync to Radarr 4K, no rule matched`)
  })
})

describe('failedSentence', () => {
  it('names the instance and the reason', () => {
    expect(failedSentence(names, 1, 'Path does not exist')).toBe(
      '"Suspiria" for jay (Jayman) to Radarr NZB failed: Path does not exist',
    )
  })
})
