import {
  type ComparisonOperator,
  type ConditionValue,
  ContentRouterRuleSchema,
  ContentRouterRuleUpdateSchema,
} from '@root/schemas/content-router/content-router.schema.js'
import { RADARR_MONITOR_OPTIONS } from '@root/schemas/radarr/add-options.schema.js'
import {
  SONARR_ROLLING_MONITOR_OPTIONS,
  SONARR_UI_MONITOR_OPTIONS,
} from '@root/schemas/sonarr/season-monitoring.schema.js'
import { SONARR_SERIES_TYPES } from '@root/schemas/sonarr/series-type.schema.js'
import { describe, expect, it } from 'vitest'
import type { z } from 'zod'

type LegacyPayload = z.input<typeof ContentRouterRuleSchema>

interface LegacyCondition {
  field: string
  operator: ComparisonOperator
  value: ConditionValue
  negate: boolean
  _cid: string
}

interface LegacyGroup {
  operator: 'AND' | 'OR'
  negate: boolean
  conditions: Array<LegacyCondition | LegacyGroup>
  _cid: string
}

let cidSequence = 0

function cid(): string {
  cidSequence += 1
  return `00000000-0000-4000-8000-${String(cidSequence).padStart(12, '0')}`
}

function when(
  field: string,
  operator: ComparisonOperator,
  value: ConditionValue,
  negate = false,
): LegacyCondition {
  return { field, operator, value, negate, _cid: cid() }
}

function group(
  operator: 'AND' | 'OR',
  negate: boolean,
  ...conditions: Array<LegacyCondition | LegacyGroup>
): LegacyGroup {
  return { operator, negate, conditions, _cid: cid() }
}

function all(...conditions: Array<LegacyCondition | LegacyGroup>): LegacyGroup {
  return group('AND', false, ...conditions)
}

function sent(
  condition: LegacyGroup,
  overrides: Partial<LegacyPayload> = {},
): LegacyPayload {
  return {
    name: 'Legacy rule',
    target_type: 'radarr',
    target_instance_id: 2,
    quality_profile: 4,
    root_folder: '/movies',
    tags: [],
    enabled: true,
    order: 50,
    condition,
    search_on_add: true,
    season_monitoring: undefined,
    series_type: undefined,
    monitor: 'movieOnly',
    always_require_approval: false,
    bypass_user_quotas: false,
    approval_reason: '',
    exclude_from_routing: false,
    ...overrides,
  }
}

const SONARR: Partial<LegacyPayload> = {
  target_type: 'sonarr',
  root_folder: '/tv',
  season_monitoring: 'all',
  series_type: 'standard',
  monitor: undefined,
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
  [
    'season between typed into the legacy fallback text input',
    when('season', 'between', '1-3'),
  ],
]

const nested = group(
  'OR',
  true,
  when('genres', 'in', ['Anime'], true),
  group(
    'AND',
    true,
    when('year', 'greaterThan', 2010),
    group(
      'OR',
      false,
      when('user', 'in', [7, 8], true),
      group(
        'AND',
        true,
        when('imdbRating', 'between', { min: 7 }),
        when('streamingServices', 'notIn', [8]),
      ),
    ),
  ),
)

const genreRule = all(when('genres', 'in', ['Anime']))
const seasonRule = all(when('seriesStatus', 'equals', 'continuing'))

const payloads: Array<[string, LegacyPayload]> = [
  ...radarrConditions.map(([label, condition]): [string, LegacyPayload] => [
    label,
    sent(all(condition)),
  ]),
  ...sonarrConditions.map(([label, condition]): [string, LegacyPayload] => [
    label,
    sent(all(condition), SONARR),
  ]),
  ['three levels of groups with negate at every level', sent(nested)],
  [
    'exclude rule with no target',
    sent(genreRule, {
      exclude_from_routing: true,
      target_instance_id: null,
      quality_profile: undefined,
      root_folder: undefined,
    }),
  ],
  [
    'radarr rule with search on add unset',
    sent(genreRule, { search_on_add: undefined }),
  ],
  ...[...SONARR_UI_MONITOR_OPTIONS, ...SONARR_ROLLING_MONITOR_OPTIONS].map(
    (option): [string, LegacyPayload] => [
      `sonarr season monitoring ${option}`,
      sent(seasonRule, { ...SONARR, season_monitoring: option }),
    ],
  ),
  ...SONARR_SERIES_TYPES.map((seriesType): [string, LegacyPayload] => [
    `sonarr series type ${seriesType}`,
    sent(seasonRule, { ...SONARR, series_type: seriesType }),
  ]),
  [
    'sonarr series type none',
    sent(seasonRule, { ...SONARR, series_type: undefined }),
  ],
  ...RADARR_MONITOR_OPTIONS.map((monitor): [string, LegacyPayload] => [
    `radarr monitor ${monitor}`,
    sent(genreRule, { monitor }),
  ]),
  ['lowest priority', sent(genreRule, { order: 1 })],
  ['highest priority', sent(genreRule, { order: 100 })],
  ['disabled rule', sent(genreRule, { enabled: false })],
  ['tags set', sent(genreRule, { tags: ['anime', '4k'] })],
  [
    'approval with a reason and quota bypass',
    sent(genreRule, {
      always_require_approval: true,
      approval_reason: 'Anime needs a look',
      bypass_user_quotas: true,
    }),
  ],
]

describe('legacy router rule payloads', () => {
  it.each(payloads)('create schema accepts %s', (_label, payload) => {
    expect(
      ContentRouterRuleSchema.safeParse(payload).error?.issues ?? [],
    ).toEqual([])
  })

  it.each(payloads)('update schema accepts %s', (_label, payload) => {
    expect(
      ContentRouterRuleUpdateSchema.safeParse(payload).error?.issues ?? [],
    ).toEqual([])
  })
})
