import {
  canReorder,
  fallbackLine,
  orderAssignments,
  orderNote,
  routeDestination,
  routesFor,
  routesLabel,
  siblingHint,
  yieldsTo,
} from '@/features/library/lib/content-router/route-list'
import type { components } from '@/types/api.js'

type RouterRule = components['schemas']['RouterRule']

function rule(overrides: Partial<RouterRule> & { id: number }): RouterRule {
  return {
    name: `Route ${overrides.id}`,
    target_type: 'radarr',
    target_instance_id: 1,
    order: 50,
    exclude_from_routing: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('routeDestination', () => {
  it('names the instance and joins what is set', () => {
    expect(
      routeDestination('radarr', {
        exclude: false,
        instanceName: 'Radarr',
        qualityProfile: 'HD-1080p',
        rootFolder: null,
      }),
    ).toEqual({ kind: 'instance', name: 'Radarr', detail: 'HD-1080p' })
  })

  it('says a skip rule is not routed', () => {
    expect(
      routeDestination('sonarr', {
        exclude: true,
        instanceName: 'Sonarr',
        qualityProfile: null,
        rootFolder: null,
      }),
    ).toEqual({
      kind: 'skipped',
      head: 'Skipped.',
      detail: 'Matching shows are not sent to Sonarr',
    })
  })

  it('reads a route without an instance as not routed', () => {
    expect(
      routeDestination('radarr', {
        exclude: false,
        instanceName: null,
        qualityProfile: null,
        rootFolder: '/movies',
      }),
    ).toEqual({
      kind: 'skipped',
      head: 'Not routed.',
      detail: 'This route has no instance',
    })
  })
})

describe('fallbackLine', () => {
  it('says so when no instance is set up', () => {
    expect(fallbackLine('radarr', null)).toBe('No instance is set up yet.')
  })
})

describe('routesFor', () => {
  it('puts exclude rules first and sorts each group by priority then id', () => {
    const rules = [
      rule({ id: 1, order: 90 }),
      rule({ id: 2, order: 10, exclude_from_routing: true }),
      rule({ id: 3, order: 90 }),
      rule({ id: 4, order: 60, exclude_from_routing: true }),
      rule({ id: 5, order: null }),
      rule({ id: 6, target_type: 'sonarr' }),
    ]
    expect(routesFor(rules, 'radarr').map(({ id }) => id)).toEqual([
      4, 2, 1, 3, 5,
    ])
  })
})

describe('orderNote', () => {
  it('names the content type', () => {
    expect(orderNote('sonarr', false)).toEqual({
      lead: 'Routes run top to bottom.',
      body: 'Every matching route sends the show. When two share an instance, the one nearer the top wins. The top match decides approval and quotas.',
    })
  })

  it('says skip routes go first when the tab has one', () => {
    expect(orderNote('radarr', true).body).toBe(
      'Skip routes run first, and a match keeps the movie out. Every matching route sends the movie. When two share an instance, the one nearer the top wins. The top match decides approval and quotas.',
    )
  })
})

describe('yieldsTo', () => {
  it('lists every earlier route on the same instance', () => {
    const routes = [
      rule({ id: 1, name: 'Skip', exclude_from_routing: true }),
      rule({ id: 2, name: 'Anime 4K', target_instance_id: 1 }),
      rule({ id: 3, name: 'Kids', target_instance_id: 2 }),
      rule({ id: 4, name: 'Anime', target_instance_id: 1 }),
      rule({ id: 5, name: 'Docs', target_instance_id: 1 }),
      rule({ id: 6, name: 'Loose', target_instance_id: null }),
    ]
    expect(yieldsTo(routes)).toEqual(
      new Map([
        [4, [2]],
        [5, [2, 4]],
      ]),
    )
  })

  it('skips disabled routes as winners but still hints on them', () => {
    const routes = [
      rule({ id: 1, target_instance_id: 1, enabled: false }),
      rule({ id: 2, target_instance_id: 1 }),
      rule({ id: 3, target_instance_id: 1, enabled: false }),
      rule({ id: 4, target_instance_id: 1 }),
    ]
    expect(yieldsTo(routes)).toEqual(
      new Map([
        [3, [2]],
        [4, [2]],
      ]),
    )
  })

  it('ignores exclude rules even when they name an instance', () => {
    const routes = [
      rule({ id: 1, exclude_from_routing: true, target_instance_id: 1 }),
      rule({ id: 2, target_instance_id: 1 }),
    ]
    expect(yieldsTo(routes).size).toBe(0)
  })
})

describe('routesLabel', () => {
  it('names the routes of each tab', () => {
    expect(routesLabel('radarr')).toBe('movie routes')
    expect(routesLabel('sonarr')).toBe('TV show routes')
  })
})

describe('siblingHint', () => {
  it('names the winning rank and the instance', () => {
    expect(siblingHint([2], 'Radarr 4K')).toBe(
      'Rank 2 wins on Radarr 4K when both match.',
    )
  })

  it('lists up to three winning ranks', () => {
    expect(siblingHint([1, 2], 'Radarr 4K')).toBe(
      'Rank 1 or 2 wins on Radarr 4K when it also matches.',
    )
    expect(siblingHint([1, 2, 3], 'Radarr 4K')).toBe(
      'Rank 1, 2 or 3 wins on Radarr 4K when it also matches.',
    )
  })

  it('stops naming ranks past three', () => {
    expect(siblingHint([1, 2, 3, 4], 'Radarr 4K')).toBe(
      'A higher rank on Radarr 4K wins when it also matches.',
    )
  })
})

describe('orderAssignments', () => {
  it('counts down from the top priority and skips unchanged rules', () => {
    const routes = [
      rule({ id: 1, order: 100 }),
      rule({ id: 2, order: 50 }),
      rule({ id: 3, order: null }),
    ]
    expect(orderAssignments([1, 3, 2], routes)).toEqual([
      { id: 3, order: 99 },
      { id: 2, order: 98 },
    ])
  })

  it('returns nothing when every rule already holds its new priority', () => {
    const routes = [rule({ id: 1, order: 100 }), rule({ id: 2, order: 99 })]
    expect(orderAssignments([1, 2], routes)).toEqual([])
  })
})

describe('canReorder', () => {
  it('needs at least two routes that are not exclude rules', () => {
    expect(
      canReorder([
        rule({ id: 1 }),
        rule({ id: 2, exclude_from_routing: true }),
      ]),
    ).toBe(false)
    expect(canReorder([rule({ id: 1 }), rule({ id: 2 })])).toBe(true)
  })

  it('stops past the number of priorities available', () => {
    const many = (count: number) =>
      Array.from({ length: count }, (_, index) => rule({ id: index + 1 }))
    expect(canReorder(many(100))).toBe(true)
    expect(canReorder(many(101))).toBe(false)
  })
})
