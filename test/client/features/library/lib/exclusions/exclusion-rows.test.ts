import {
  bulkExcludePlan,
  bulkRemovePlan,
  exclusionIds,
  keysHoldingIds,
  lastExcludedAt,
} from '@/features/library/lib/exclusions/exclusion-rows'
import type { components } from '@/types/api.js'

type ExclusionItem = components['schemas']['WatchlistExclusionItem']
type ExclusionUser = components['schemas']['WatchlistExclusionUser']

function user(overrides: Partial<ExclusionUser>): ExclusionUser {
  return {
    userId: 1,
    userName: 'sarah',
    status: 'requested',
    added: '2026-01-01T00:00:00Z',
    ownExclusion: null,
    ...overrides,
  }
}

function item(overrides: Partial<ExclusionItem>): ExclusionItem {
  return {
    key: 'plex-1',
    title: 'Severance',
    type: 'show',
    guids: ['tvdb:371980'],
    thumb: null,
    globalExclusion: null,
    watchlisterCount: 0,
    excludedCount: 0,
    users: [],
    ...overrides,
  }
}

describe('lastExcludedAt', () => {
  it('is null without any exclusion', () => {
    expect(lastExcludedAt(item({ users: [user({})] }))).toBeNull()
  })

  it('picks the newest of the global and own exclusions', () => {
    const row = item({
      globalExclusion: { id: 9, excludedAt: '2026-03-01T00:00:00Z' },
      users: [
        user({ ownExclusion: { id: 1, excludedAt: '2026-05-01T00:00:00Z' } }),
        user({
          userId: 2,
          ownExclusion: { id: 2, excludedAt: '2026-04-01T00:00:00Z' },
        }),
      ],
    })
    expect(lastExcludedAt(row)).toBe('2026-05-01T00:00:00Z')
  })

  it('uses the global exclusion when it is the only one', () => {
    const row = item({
      globalExclusion: { id: 9, excludedAt: '2026-03-01T00:00:00Z' },
    })
    expect(lastExcludedAt(row)).toBe('2026-03-01T00:00:00Z')
  })
})

describe('bulk plans', () => {
  const excludedSarah = user({
    ownExclusion: { id: 4, excludedAt: '2026-04-01T00:00:00Z' },
  })
  const jamie = user({ userId: 2, userName: 'jamie' })
  const gone = user({
    userId: 3,
    status: null,
    ownExclusion: { id: 5, excludedAt: '2026-04-02T00:00:00Z' },
  })
  const mixed = item({ key: 'a', users: [excludedSarah, jamie, gone] })
  const done = item({ key: 'b', users: [excludedSarah] })
  const global = item({
    key: 'c',
    globalExclusion: { id: 9, excludedAt: '2026-03-01T00:00:00Z' },
  })

  it('excludes only watchlisters without their own exclusion under users scope', () => {
    const plan = bulkExcludePlan([mixed, done, global], 'users')
    expect(plan.skipped).toBe(2)
    expect(plan.payloads.map((payload) => payload.userIds)).toEqual([[2]])
  })

  it('skips rows that already have a global exclusion under global scope', () => {
    const plan = bulkExcludePlan([mixed, done, global], 'global')
    expect(plan.skipped).toBe(1)
    expect(plan.payloads.map((payload) => payload.key)).toEqual(['a', 'b'])
    expect(plan.payloads[0]?.userIds).toEqual([1, 2, 3])
  })

  it('removes every global and own exclusion id', () => {
    expect(exclusionIds(global)).toEqual([9])
    expect(bulkRemovePlan([mixed, global, item({ key: 'd' })])).toEqual({
      ids: [4, 5, 9],
      rows: 2,
    })
  })

  it('maps failed ids back to the rows holding them', () => {
    expect(keysHoldingIds([mixed, done, global], [5, 9])).toEqual(['a', 'c'])
  })
})
