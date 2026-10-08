import { ROOT_ID } from '@/features/library/lib/content-router/condition-tree'
import {
  conditionNodes,
  conditionTree,
  draftValue,
  type RouteFormValues,
  type RouteRoutingValues,
  ruleFormValues,
  rulePayload,
  usesField,
} from '@/features/library/lib/content-router/route-form'
import type { components } from '@/types/api.js'
import { resolvers } from '../../content-router-fixtures.js'

type RouterRule = components['schemas']['RouterRule']

const { controlFor, numeric, blank } = resolvers()

const routing: RouteRoutingValues = {
  instanceId: '1',
  qualityProfile: '4',
  rootFolder: '/movies',
  tags: [],
  searchOnAdd: true,
  seasonMonitoring: 'all',
  seriesType: 'standard',
  monitor: 'movieOnly',
}

function rule(overrides: Partial<RouterRule>): RouterRule {
  return {
    id: 9,
    name: 'Anime',
    target_type: 'radarr',
    target_instance_id: 2,
    order: 70,
    enabled: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const nested = {
  operator: 'AND' as const,
  negate: false,
  conditions: [
    {
      field: 'genres',
      operator: 'in' as const,
      value: ['Anime'],
      negate: true,
    },
    {
      operator: 'OR' as const,
      negate: true,
      conditions: [
        { field: 'user', operator: 'in', value: [7, 8], negate: false },
        {
          operator: 'AND',
          negate: false,
          conditions: [
            {
              field: 'year',
              operator: 'between',
              value: { min: 2010, max: 2020 },
              negate: false,
            },
          ],
        },
      ],
    },
  ],
}

describe('conditionNodes and conditionTree', () => {
  it('round-trips nested groups, NOT and numeric ids', () => {
    const nodes = conditionNodes(nested, controlFor, blank)

    expect(nodes[0]).toMatchObject({ id: ROOT_ID, operator: 'AND' })
    expect(
      nodes.find((node) => node.kind === 'condition' && node.field === 'user'),
    ).toMatchObject({ value: ['7', '8'] })
    expect(conditionTree(nodes, numeric)).toEqual(nested)
  })

  it('wraps a single stored condition in an AND root', () => {
    const nodes = conditionNodes(
      { field: 'genres', operator: 'contains', value: 'Anime', negate: false },
      controlFor,
      blank,
    )

    expect(conditionTree(nodes, numeric)).toEqual({
      operator: 'AND',
      negate: false,
      conditions: [
        {
          field: 'genres',
          operator: 'contains',
          value: 'Anime',
          negate: false,
        },
      ],
    })
  })

  it('starts an empty rule with one blank condition', () => {
    const nodes = conditionNodes(undefined, controlFor, blank)

    expect(nodes).toHaveLength(2)
    expect(nodes[1]).toMatchObject({ kind: 'condition', parentId: ROOT_ID })
  })

  it('splits an IMDb rating with votes and folds it back', () => {
    const stored = {
      operator: 'AND' as const,
      negate: false,
      conditions: [
        {
          field: 'imdbRating',
          operator: 'greaterThan' as const,
          value: { rating: 7.5, votes: 10000 },
          negate: false,
        },
      ],
    }
    const nodes = conditionNodes(stored, controlFor, blank)

    expect(nodes[1]).toMatchObject({ value: 7.5, votes: 10000 })
    expect(conditionTree(nodes, numeric)).toEqual(stored)
  })

  it('keeps a vote count on an IMDb list of ratings', () => {
    const stored = {
      operator: 'AND' as const,
      negate: false,
      conditions: [
        {
          field: 'imdbRating',
          operator: 'in' as const,
          value: { rating: [7, 8], votes: 5000 },
          negate: false,
        },
      ],
    }
    const nodes = conditionNodes(stored, controlFor, blank)

    expect(nodes[1]).toMatchObject({ value: ['7', '8'], votes: 5000 })
    expect(conditionTree(nodes, numeric)).toEqual(stored)
  })

  it('loads user equals with a stored list as in chips and keeps every entry', () => {
    const nodes = conditionNodes(
      { field: 'user', operator: 'equals', value: [5, 7], negate: false },
      controlFor,
      blank,
    )

    expect(nodes[1]).toMatchObject({ operator: 'in', value: ['5', '7'] })
    expect(conditionTree(nodes, numeric).conditions).toEqual([
      { field: 'user', operator: 'in', value: [5, 7], negate: false },
    ])
  })

  it('loads user notEquals with a stored list as notIn', () => {
    const nodes = conditionNodes(
      { field: 'user', operator: 'notEquals', value: ['7'], negate: false },
      controlFor,
      blank,
    )

    expect(nodes[1]).toMatchObject({ operator: 'notIn', value: ['7'] })
  })
})

describe('draftValue', () => {
  it('reads a stored scalar as one chip', () => {
    expect(
      draftValue('Anime', { kind: 'chips', numeric: false, source: null }),
    ).toEqual(['Anime'])
  })

  it('reads a numeric string into a number input', () => {
    expect(draftValue('2020', { kind: 'number' })).toBe(2020)
  })

  it('keeps the value as it is when the field is unknown', () => {
    expect(draftValue(['a', 2], null)).toEqual(['a', '2'])
  })
})

describe('usesField', () => {
  it('finds a field at any depth', () => {
    expect(usesField(nested, 'year')).toBe(true)
    expect(usesField(nested, 'streamingServices')).toBe(false)
  })
})

describe('ruleFormValues', () => {
  const context = {
    routingDefaults: () => routing,
    resolve: controlFor,
    blank,
  }

  it('fills a new route from the default instance', () => {
    expect(ruleFormValues(null, context)).toMatchObject({
      name: '',
      order: 50,
      action: 'route',
      routing,
    })
  })

  it('reads a stored route with its own routing', () => {
    expect(
      ruleFormValues(
        rule({
          quality_profile: 6,
          root_folder: '/anime',
          tags: ['3'],
          search_on_add: false,
          monitor: 'none',
          always_require_approval: true,
          approval_reason: 'Anime goes to review',
        }),
        context,
      ),
    ).toMatchObject({
      name: 'Anime',
      order: 70,
      action: 'route',
      routing: {
        instanceId: '2',
        qualityProfile: '6',
        rootFolder: '/anime',
        tags: ['3'],
        searchOnAdd: false,
        monitor: 'none',
      },
      always_require_approval: true,
      approval_reason: 'Anime goes to review',
    })
  })

  it('reads null routing fields as inherit', () => {
    expect(
      ruleFormValues(
        rule({
          quality_profile: null,
          root_folder: null,
          search_on_add: null,
          monitor: null,
        }),
        context,
      ).routing,
    ).toEqual({
      instanceId: '2',
      qualityProfile: null,
      rootFolder: null,
      tags: [],
      searchOnAdd: null,
      seasonMonitoring: null,
      seriesType: null,
      monitor: null,
    })
  })

  it('keeps the default routing for an exclude rule', () => {
    expect(
      ruleFormValues(
        rule({ exclude_from_routing: true, target_instance_id: null }),
        context,
      ),
    ).toMatchObject({ action: 'exclude', routing })
  })
})

describe('rulePayload', () => {
  const values: RouteFormValues = {
    name: 'Kids',
    order: 80,
    action: 'route',
    routing,
    always_require_approval: false,
    approval_reason: 'stale',
    bypass_user_quotas: true,
    conditions: conditionNodes(nested, controlFor, blank),
  }

  it('builds a Radarr route payload', () => {
    expect(
      rulePayload(values, { type: 'radarr', enabled: true, numeric }),
    ).toEqual({
      name: 'Kids',
      target_type: 'radarr',
      target_instance_id: 1,
      quality_profile: 4,
      root_folder: '/movies',
      tags: [],
      enabled: true,
      order: 80,
      condition: nested,
      search_on_add: true,
      season_monitoring: undefined,
      series_type: undefined,
      monitor: 'movieOnly',
      always_require_approval: false,
      approval_reason: undefined,
      bypass_user_quotas: true,
      exclude_from_routing: false,
    })
  })

  it('sends Sonarr options only for Sonarr routes', () => {
    expect(
      rulePayload(values, { type: 'sonarr', enabled: false, numeric }),
    ).toMatchObject({
      enabled: false,
      season_monitoring: 'all',
      series_type: 'standard',
      monitor: undefined,
    })
  })

  it('sends null for every inherited field', () => {
    const inherit: RouteRoutingValues = {
      instanceId: '1',
      qualityProfile: null,
      rootFolder: null,
      tags: [],
      searchOnAdd: null,
      seasonMonitoring: null,
      seriesType: null,
      monitor: null,
    }
    expect(
      rulePayload(
        { ...values, routing: inherit },
        { type: 'sonarr', enabled: true, numeric },
      ),
    ).toMatchObject({
      target_instance_id: 1,
      quality_profile: null,
      root_folder: null,
      tags: [],
      search_on_add: null,
      season_monitoring: null,
      series_type: null,
    })
  })

  it('clears routing and approval for an exclude rule', () => {
    expect(
      rulePayload(
        { ...values, action: 'exclude', always_require_approval: true },
        { type: 'radarr', enabled: true, numeric },
      ),
    ).toMatchObject({
      target_instance_id: null,
      quality_profile: undefined,
      root_folder: undefined,
      tags: [],
      search_on_add: undefined,
      always_require_approval: false,
      approval_reason: undefined,
      bypass_user_quotas: false,
      exclude_from_routing: true,
    })
  })
})
