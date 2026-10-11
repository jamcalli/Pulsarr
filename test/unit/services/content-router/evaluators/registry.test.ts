import { ComparisonOperatorSchema } from '@root/schemas/content-router/content-router.schema.js'
import {
  ROUTER_FIELD_NAMES,
  ROUTER_FIELDS,
} from '@root/schemas/content-router/router-fields.js'
import type { RoutingContext } from '@root/types/router.types.js'
import { FIELD_EVALUATORS } from '@services/content-router/evaluators/registry.js'
import { describe, expect, it } from 'vitest'
import {
  BASE_CONTEXT,
  movie,
  provider,
  show,
} from '../../../../mocks/content-router-items.js'
import { createMockLogger } from '../../../../mocks/logger.js'

const sharedData = {
  genres: ['Action'],
  imdb: { rating: 7, votes: 7 },
  rtCritic: 7,
  rtAudience: 7,
  tmdb: 7,
  watchProviders: { flatrate: [provider(7, 'Seven')] },
  listMemberships: new Set(['action']),
}

const scenarios: Array<[ReturnType<typeof movie>, RoutingContext]> = [
  [
    movie(sharedData, {
      year: 7,
      certification: 'Action',
      originalLanguage: { id: 1, name: 'Action' },
      status: 'released',
    }),
    { ...BASE_CONTEXT, userId: 7, userName: 'action' },
  ],
  [
    show(sharedData, {
      year: 7,
      seasons: [{ seasonNumber: 7, monitored: true }],
      status: 'continuing',
    }),
    { ...BASE_CONTEXT, contentType: 'show', userId: 7, userName: 'action' },
  ],
]

const SAMPLE_VALUES: readonly unknown[] = [
  7,
  70,
  6,
  80,
  8,
  700,
  [7],
  [70],
  [8],
  { min: 1, max: 100 },
  'action',
  'act',
  'released',
  'continuing',
  'other',
  ['action'],
  ['other'],
  ['released', 'continuing'],
  '^act',
]

describe('FIELD_EVALUATORS', () => {
  it('binds an evaluator to every field', () => {
    expect(Object.keys(FIELD_EVALUATORS).sort()).toEqual(
      [...ROUTER_FIELD_NAMES].sort(),
    )
  })

  it.each([...ROUTER_FIELD_NAMES])(
    'every advertised operator on %s can match',
    (field) => {
      const operators = ComparisonOperatorSchema.options.filter((operator) =>
        Object.hasOwn(ROUTER_FIELDS[field].operators, operator),
      )
      const dead = operators.filter(
        (operator) =>
          !scenarios.some(([item, context]) =>
            SAMPLE_VALUES.some(
              (value) =>
                FIELD_EVALUATORS[field].evaluate(
                  operator,
                  value,
                  item,
                  context,
                  createMockLogger(),
                ) === true,
            ),
          ),
      )
      expect(dead).toEqual([])
    },
  )
})
