import { evaluatorMetadata } from '@root/schemas/content-router/router-fields'
import { RADARR_MONITOR_OPTIONS } from '@root/schemas/radarr/add-options.schema'
import {
  SONARR_ROLLING_MONITOR_OPTIONS,
  SONARR_UI_MONITOR_OPTIONS,
} from '@root/schemas/sonarr/season-monitoring.schema'
import { SONARR_SERIES_TYPES } from '@root/schemas/sonarr/series-type.schema'
import {
  type ConditionOperator,
  conditionFields,
  type RouteType,
} from '@/features/library/lib/content-router/condition-fields'
import {
  blankCondition,
  type ConditionNode,
  emptyDraftValue,
  type RuleNode,
} from '@/features/library/lib/content-router/condition-tree'
import {
  type ControlResolver,
  inheritRouting,
  type NumericResolver,
  type RouteFormValues,
  ruleFormValues,
  rulePayload,
} from '@/features/library/lib/content-router/route-form'
import { valueControlFor } from '@/features/library/lib/content-router/value-control'
import type { components } from '@/types/api.js'

type RouterRule = components['schemas']['RouterRule']
type RouterRulePayload = components['schemas']['RouterRulePayload']
type GroupOperator = components['schemas']['RouterGroupOperator']
type StoredValue = Extract<
  NonNullable<RouterRule['condition']>,
  { field: string }
>['value']

interface LegacyCondition {
  field: string
  operator: ConditionOperator
  value: StoredValue
  negate: boolean
  _cid?: string
}

interface LegacyGroup {
  operator: GroupOperator
  negate: boolean
  conditions: Array<LegacyCondition | LegacyGroup>
  _cid?: string
}

interface LegacyCase {
  label: string
  condition: LegacyGroup
  rule: RouterRule
  /** Set when the strict comparison is known to fail, naming the difference. */
  finding?: string
  /** True when loading is known to blank a condition value. */
  blanked?: true
}

function catalog(type: RouteType) {
  const fields = conditionFields(evaluatorMetadata(), type)
  const controlFor: ControlResolver = (field, operator) => {
    const known = fields.find((candidate) => candidate.name === field)
    if (!known) return null
    return valueControlFor(
      field,
      known.operators.find((candidate) => candidate.name === operator),
    )
  }
  const numeric: NumericResolver = (field, operator) => {
    const control = controlFor(field, operator)
    return (
      (control?.kind === 'chips' || control?.kind === 'select') &&
      control.numeric
    )
  }
  const emptyValue = (field: string, operator: ConditionOperator) =>
    emptyDraftValue(controlFor(field, operator)?.kind ?? 'text')
  return {
    controlFor,
    numeric,
    blank: (parentId: string) => blankCondition(parentId, fields, emptyValue),
  }
}

function when(
  field: string,
  operator: ConditionOperator,
  value: StoredValue,
  negate = false,
): LegacyCondition {
  return { field, operator, value, negate }
}

function all(...conditions: Array<LegacyCondition | LegacyGroup>): LegacyGroup {
  return { operator: 'AND', negate: false, conditions }
}

function stored(
  label: string,
  condition: LegacyGroup,
  overrides: Partial<RouterRule> = {},
  finding?: string,
): LegacyCase {
  return {
    label,
    condition,
    finding,
    rule: {
      id: 1,
      name: label,
      target_type: 'radarr',
      target_instance_id: 2,
      condition,
      root_folder: '/movies',
      quality_profile: 4,
      tags: [],
      order: 50,
      enabled: true,
      search_on_add: true,
      season_monitoring: null,
      series_type: null,
      monitor: 'movieOnly',
      always_require_approval: false,
      bypass_user_quotas: false,
      exclude_from_routing: false,
      created_at: '2025-01-01T00:00:00.000Z',
      updated_at: '2025-01-01T00:00:00.000Z',
      ...overrides,
    },
  }
}

const SONARR: Partial<RouterRule> = {
  target_type: 'sonarr',
  root_folder: '/tv',
  season_monitoring: 'all',
  series_type: 'standard',
  monitor: null,
}

const radarrConditions: Array<[string, LegacyCondition]> = [
  ['genres equals one genre', when('genres', 'equals', 'Anime')],
  ['genres equals a genre list', when('genres', 'equals', ['Action', 'Drama'])],
  ['genres contains', when('genres', 'contains', 'Anime')],
  ['genres notContains', when('genres', 'notContains', 'Horror')],
  ['genres in', when('genres', 'in', ['Action', 'Thriller'])],
  ['genres notIn', when('genres', 'notIn', ['Horror'])],
  ['genres regex', when('genres', 'regex', '^Sci')],
  ['certification equals', when('certification', 'equals', 'R')],
  [
    'certification equals a numeric rating',
    when('certification', 'equals', '12'),
  ],
  ['certification notEquals', when('certification', 'notEquals', 'NC-17')],
  ['certification in', when('certification', 'in', ['PG', 'PG-13'])],
  ['certification contains', when('certification', 'contains', 'PG')],
  ['certification regex', when('certification', 'regex', '^TV-')],
  ['movieStatus equals', when('movieStatus', 'equals', 'released')],
  ['movieStatus in', when('movieStatus', 'in', ['released', 'inCinemas'])],
  ['user equals a numeric id', when('user', 'equals', 7)],
  ['user equals a numeric id as a string', when('user', 'equals', '7')],
  ['user equals a username', when('user', 'equals', 'alice')],
  [
    'user notEquals from the legacy multi-select',
    when('user', 'notEquals', [7]),
  ],
  ['user notEquals a numeric id', when('user', 'notEquals', 7)],
  ['user in ids', when('user', 'in', [7, 8])],
  ['user notIn ids', when('user', 'notIn', [9])],
  ['user equals a one-element list', when('user', 'equals', [7])],
  ['streamingServices in ids', when('streamingServices', 'in', [8, 337])],
  ['streamingServices notIn ids', when('streamingServices', 'notIn', [15])],
  ['streamingServices in one id', when('streamingServices', 'in', 8)],
  ['imdbRating greaterThan', when('imdbRating', 'greaterThan', 7.5)],
  ['imdbRating lessThan', when('imdbRating', 'lessThan', 5)],
  ['imdbRating between', when('imdbRating', 'between', { min: 6, max: 8.5 })],
  ['imdbRating in', when('imdbRating', 'in', [7, 8.5])],
  [
    'imdbRating rating and votes',
    when('imdbRating', 'greaterThan', { rating: 7, votes: 10000 }),
  ],
  [
    'imdbRating range and votes',
    when('imdbRating', 'between', { rating: { min: 6, max: 9 }, votes: 500 }),
  ],
  [
    'imdbRating list and votes',
    when('imdbRating', 'in', { rating: [7, 8], votes: 5000 }),
  ],
  ['imdbRating votes only', when('imdbRating', 'greaterThan', { votes: 2500 })],
  ['rtCriticRating greaterThan', when('rtCriticRating', 'greaterThan', 80)],
  [
    'rtCriticRating between',
    when('rtCriticRating', 'between', { min: 60, max: 90 }),
  ],
  ['rtAudienceRating greaterThan', when('rtAudienceRating', 'greaterThan', 75)],
  [
    'rtAudienceRating between',
    when('rtAudienceRating', 'between', { min: 50 }),
  ],
  ['tmdbRating greaterThan', when('tmdbRating', 'greaterThan', 7.2)],
  ['tmdbRating between', when('tmdbRating', 'between', { min: 6.5, max: 9 })],
  ['tmdbRating in', when('tmdbRating', 'in', [7, 8])],
  ['year greaterThan', when('year', 'greaterThan', 2000)],
  ['year between', when('year', 'between', { min: 1980, max: 1989 })],
  ['year in', when('year', 'in', [1999, 2000])],
  ['language equals', when('language', 'equals', 'English')],
  ['language in', when('language', 'in', ['English', 'French'])],
  ['plexList equals', when('plexList', 'equals', 'Favorites')],
]

const sonarrConditions: Array<[string, LegacyCondition]> = [
  ['seriesStatus equals', when('seriesStatus', 'equals', 'continuing')],
  ['seriesStatus in', when('seriesStatus', 'in', ['ended', 'upcoming'])],
  ['season equals', when('season', 'equals', 1)],
  ['season in', when('season', 'in', [1, 2])],
  ['season between', when('season', 'between', { min: 1, max: 3 })],
]

const nested: LegacyGroup = {
  operator: 'OR',
  negate: true,
  conditions: [
    when('genres', 'in', ['Anime'], true),
    {
      operator: 'AND',
      negate: true,
      conditions: [
        when('year', 'greaterThan', 2010),
        {
          operator: 'OR',
          negate: false,
          conditions: [
            when('user', 'in', [7, 8], true),
            {
              operator: 'AND',
              negate: true,
              conditions: [
                when('imdbRating', 'between', { min: 7 }),
                when('streamingServices', 'notIn', [8]),
              ],
            },
          ],
        },
      ],
    },
  ],
}

const withCids: LegacyGroup = {
  operator: 'AND',
  negate: false,
  _cid: 'cid-root',
  conditions: [
    { ...when('genres', 'in', ['Anime']), _cid: 'cid-1' },
    {
      operator: 'OR',
      negate: false,
      _cid: 'cid-2',
      conditions: [{ ...when('year', 'greaterThan', 2000), _cid: 'cid-3' }],
    },
  ],
}

const genreRule = all(when('genres', 'in', ['Anime']))
const seasonRule = all(when('seriesStatus', 'equals', 'continuing'))

const cases: LegacyCase[] = [
  ...radarrConditions.map(([label, condition]) =>
    stored(label, all(condition)),
  ),
  ...sonarrConditions.map(([label, condition]) =>
    stored(label, all(condition), SONARR),
  ),
  stored('three levels of groups with negate at every level', nested),
  stored('exclude rule with no target', genreRule, {
    exclude_from_routing: true,
    target_instance_id: null,
    root_folder: null,
    quality_profile: null,
    search_on_add: null,
    monitor: null,
  }),
  stored('radarr rule inheriting every routing field', genreRule, {
    root_folder: null,
    quality_profile: null,
    search_on_add: null,
    monitor: null,
  }),
  stored('sonarr rule inheriting every routing field', seasonRule, {
    ...SONARR,
    root_folder: null,
    quality_profile: null,
    search_on_add: null,
    season_monitoring: null,
    series_type: null,
  }),
  stored('quality profile stored as a numeric string', genreRule, {
    quality_profile: '4',
  }),
  ...[...SONARR_UI_MONITOR_OPTIONS, ...SONARR_ROLLING_MONITOR_OPTIONS].map(
    (option) =>
      stored(`sonarr season monitoring ${option}`, seasonRule, {
        ...SONARR,
        season_monitoring: option,
      }),
  ),
  ...SONARR_SERIES_TYPES.map((seriesType) =>
    stored(`sonarr series type ${seriesType}`, seasonRule, {
      ...SONARR,
      series_type: seriesType,
    }),
  ),
  ...RADARR_MONITOR_OPTIONS.map((monitor) =>
    stored(`radarr monitor ${monitor}`, genreRule, { monitor }),
  ),
  stored('search on add off', genreRule, { search_on_add: false }),
  stored('lowest priority', genreRule, { order: 1 }),
  stored('highest priority', genreRule, { order: 100 }),
  stored('disabled rule', genreRule, { enabled: false }),
  stored('tags set', genreRule, { tags: ['anime', '4k'] }),
  stored('approval with a reason and quota bypass', genreRule, {
    always_require_approval: true,
    approval_reason: 'Anime needs a look',
    bypass_user_quotas: true,
  }),
  stored(
    'conditions carrying the legacy editor _cid keys',
    withCids,
    {},
    'the _cid keys on the root, the nested group and each condition are dropped',
  ),
  stored(
    'approval required with no reason',
    genreRule,
    { always_require_approval: true },
    'the payload sends approval_reason as an empty string where the rule had none',
  ),
  stored(
    'approval reason kept while approval is off',
    genreRule,
    { approval_reason: 'Stale reason' },
    'the payload drops approval_reason when always_require_approval is false',
  ),
  stored(
    'exclude rule as the legacy editor saved it',
    genreRule,
    {
      exclude_from_routing: true,
      target_instance_id: null,
      root_folder: null,
      quality_profile: null,
    },
    'the payload resets search_on_add and monitor to null on an exclude rule',
  ),
  stored(
    'exclude rule with approval and quota bypass set',
    genreRule,
    {
      exclude_from_routing: true,
      target_instance_id: null,
      root_folder: null,
      quality_profile: null,
      search_on_add: null,
      monitor: null,
      always_require_approval: true,
      approval_reason: 'Held',
      bypass_user_quotas: true,
    },
    'the payload forces always_require_approval, approval_reason and bypass_user_quotas off on an exclude rule',
  ),
  {
    ...stored(
      'season between typed into the legacy fallback text input',
      all(when('season', 'between', '1-3')),
      SONARR,
      'the range control reads the text as an empty range and saves {}',
    ),
    blanked: true,
  },
]

const LIST_OPERATORS: ReadonlySet<ConditionOperator> = new Set(['in', 'notIn'])
const MEMBERSHIP_OPERATORS: Partial<
  Record<ConditionOperator, ConditionOperator>
> = { equals: 'in', notEquals: 'notIn' }
const NUMERIC_ID_FIELDS: ReadonlySet<string> = new Set([
  'user',
  'streamingServices',
])
const NUMERIC_TEXT = /^-?\d+(\.\d+)?$/

function numericText(field: string, value: string | number): string | number {
  return NUMERIC_ID_FIELDS.has(field) &&
    typeof value === 'string' &&
    NUMERIC_TEXT.test(value)
    ? Number(value)
    : value
}

function listOperator(field: string, operator: ConditionOperator): boolean {
  return (
    LIST_OPERATORS.has(operator) ||
    (field === 'genres' && operator === 'equals')
  )
}

function expectedCondition(condition: LegacyCondition) {
  const { field, value } = condition
  const membership = MEMBERSHIP_OPERATORS[condition.operator]
  const operator =
    field === 'user' && Array.isArray(value) && membership
      ? membership
      : condition.operator
  let next: StoredValue = value
  if (Array.isArray(value)) {
    const items: Array<string | number> = value
    next = items.map((item) => numericText(field, item))
  } else if (typeof value === 'string' || typeof value === 'number') {
    const scalar = numericText(field, value)
    next = listOperator(field, operator) ? [scalar] : scalar
  }
  return {
    field,
    operator,
    value: next,
    negate: condition.negate,
    ...(condition._cid === undefined ? {} : { _cid: condition._cid }),
  }
}

interface ExpectedGroup {
  operator: GroupOperator
  negate: boolean
  conditions: Array<ReturnType<typeof expectedCondition> | ExpectedGroup>
  _cid?: string
}

function expectedGroup(group: LegacyGroup): ExpectedGroup {
  return {
    operator: group.operator,
    negate: group.negate,
    conditions: group.conditions.map((child) =>
      'conditions' in child ? expectedGroup(child) : expectedCondition(child),
    ),
    ...(group._cid === undefined ? {} : { _cid: group._cid }),
  }
}

function expectedPayload({ rule, condition }: LegacyCase) {
  return {
    name: rule.name,
    target_type: rule.target_type,
    target_instance_id: rule.target_instance_id,
    quality_profile:
      typeof rule.quality_profile === 'string'
        ? Number(rule.quality_profile)
        : (rule.quality_profile ?? null),
    root_folder: rule.root_folder ?? null,
    tags: rule.tags ?? [],
    enabled: rule.enabled ?? true,
    order: rule.order,
    condition: expectedGroup(condition),
    search_on_add: rule.search_on_add ?? null,
    season_monitoring: rule.season_monitoring ?? null,
    series_type: rule.series_type ?? null,
    monitor: rule.monitor ?? null,
    always_require_approval: rule.always_require_approval ?? false,
    approval_reason: rule.approval_reason ?? null,
    bypass_user_quotas: rule.bypass_user_quotas ?? false,
    exclude_from_routing: rule.exclude_from_routing ?? false,
  }
}

function sentPayload(payload: RouterRulePayload) {
  return {
    ...payload,
    quality_profile: payload.quality_profile ?? null,
    root_folder: payload.root_folder ?? null,
    tags: payload.tags ?? [],
    enabled: payload.enabled ?? true,
    order: payload.order ?? null,
    search_on_add: payload.search_on_add ?? null,
    season_monitoring: payload.season_monitoring ?? null,
    series_type: payload.series_type ?? null,
    monitor: payload.monitor ?? null,
    always_require_approval: payload.always_require_approval ?? false,
    approval_reason: payload.approval_reason ?? null,
    bypass_user_quotas: payload.bypass_user_quotas ?? false,
    exclude_from_routing: payload.exclude_from_routing ?? false,
  }
}

function isBlank(node: ConditionNode): boolean {
  const { value } = node
  if (node.votes !== undefined) return false
  if (value === undefined || value === null || value === '') return true
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') {
    return value.min === undefined && value.max === undefined
  }
  return false
}

function conditionNodesOf(nodes: readonly RuleNode[]): ConditionNode[] {
  return nodes.filter(
    (node): node is ConditionNode => node.kind === 'condition',
  )
}

function leafCount(group: LegacyGroup): number {
  return group.conditions.reduce(
    (total, child) => total + ('conditions' in child ? leafCount(child) : 1),
    0,
  )
}

function roundTrip({ rule }: LegacyCase): {
  values: RouteFormValues
  payload: RouterRulePayload
} {
  const { controlFor, numeric, blank } = catalog(rule.target_type)
  const values = ruleFormValues(rule, {
    routingDefaults: (instanceId) => inheritRouting(String(instanceId ?? 1)),
    resolve: controlFor,
    blank,
  })
  const payload = rulePayload(values, {
    type: rule.target_type,
    enabled: rule.enabled ?? true,
    numeric,
  })
  return { values, payload }
}

const clean = cases.filter((entry) => entry.finding === undefined)
const findings = cases.filter((entry) => entry.finding !== undefined)
const loaded = cases.filter((entry) => entry.blanked === undefined)
const blanked = cases.filter((entry) => entry.blanked !== undefined)

function expectNothingBlanked(entry: LegacyCase) {
  const conditions = conditionNodesOf(roundTrip(entry).values.conditions)

  expect(conditions).toHaveLength(leafCount(entry.condition))
  expect(conditions.filter(isBlank)).toEqual([])
}

describe('legacy rule round trip', () => {
  it.each(loaded)(
    'loads every condition of $label without blanking it',
    expectNothingBlanked,
  )

  it.fails.each(blanked)(
    'loads every condition of $label without blanking it ($finding)',
    expectNothingBlanked,
  )

  it.each(clean)('saves $label back unchanged', (entry) => {
    expect(sentPayload(roundTrip(entry).payload)).toEqual(
      expectedPayload(entry),
    )
  })

  it.fails.each(findings)('saves $label back unchanged ($finding)', (entry) => {
    expect(sentPayload(roundTrip(entry).payload)).toEqual(
      expectedPayload(entry),
    )
  })
})
