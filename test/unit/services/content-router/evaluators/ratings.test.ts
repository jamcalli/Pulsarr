import { evaluateLeaf } from '@services/content-router/conditions.js'
import { describe, expect, it } from 'vitest'
import {
  BASE_CONTEXT,
  bareItem,
  type LeafCase,
  movie,
} from '../../../../mocks/content-router-items.js'
import { createMockLogger } from '../../../../mocks/logger.js'

const compoundCases = (
  [
    ['greaterThan', 7],
    ['lessThan', 9],
    ['equals', 8],
    ['between', { min: 7, max: 9 }],
    ['in', [8]],
    ['notIn', [5]],
  ] as const
).flatMap(([operator, rating]): LeafCase[] =>
  (
    [
      [1000, true, 'exactly N'],
      [5000, true, 'above N'],
      [999, false, 'below N'],
    ] as const
  ).map(([votes, expected, label]) => ({
    name: `imdb ${operator} with ${label} votes is ${expected}`,
    condition: {
      field: 'imdbRating',
      operator,
      value: { rating, votes: 1000 },
    },
    item: movie({ imdb: { rating: 8, votes } }),
    expected,
  })),
)

const cases: LeafCase[] = [
  ...compoundCases,
  {
    name: 'a votes-only value means at least N votes',
    condition: {
      field: 'imdbRating',
      operator: 'lessThan',
      value: { votes: 1000 },
    },
    item: movie({ imdb: { rating: 8, votes: 1000 } }),
    expected: true,
  },
  {
    name: 'a votes-only value rejects fewer votes',
    condition: {
      field: 'imdbRating',
      operator: 'lessThan',
      value: { votes: 1000 },
    },
    item: movie({ imdb: { rating: 8, votes: 10 } }),
    expected: false,
  },
  {
    name: 'a non-number votes array is rejected',
    condition: {
      field: 'imdbRating',
      operator: 'in',
      value: { rating: [8], votes: [5000] },
    },
    item: movie({ imdb: { rating: 8, votes: 5000 } }),
    expected: false,
  },
  {
    name: 'a votes range is rejected',
    condition: {
      field: 'imdbRating',
      operator: 'between',
      value: { rating: { min: 7 }, votes: { min: 1000 } },
    },
    item: movie({ imdb: { rating: 8, votes: 5000 } }),
    expected: false,
  },
  {
    name: 'unknown vote count fails a votes filter',
    condition: {
      field: 'imdbRating',
      operator: 'greaterThan',
      value: { rating: 7, votes: 1 },
    },
    item: movie({ imdb: { rating: 8, votes: null } }),
    expected: false,
  },
  {
    name: 'a plain imdb rating compares on the 0-10 scale',
    condition: { field: 'imdbRating', operator: 'greaterThan', value: 7.5 },
    item: movie({ imdb: { rating: 8 } }),
    expected: true,
  },
  {
    name: 'imdbVotes compares the vote count',
    condition: { field: 'imdbVotes', operator: 'greaterThan', value: 1000 },
    item: movie({ imdb: { rating: 8, votes: 5000 } }),
    expected: true,
  },
  {
    name: 'tmdb compares without scaling',
    condition: {
      field: 'tmdbRating',
      operator: 'between',
      value: { min: 7, max: 8 },
    },
    item: movie({ tmdb: 7.5 }),
    expected: true,
  },
  ...[87, 85, 70, 33].flatMap((score): LeafCase[] => [
    {
      name: `rt critic equals ${score} matches the stored tenth`,
      condition: { field: 'rtCriticRating', operator: 'equals', value: score },
      item: movie({ rtCritic: score / 10 }),
      expected: true,
    },
    {
      name: `rt audience in [${score}] matches the stored tenth`,
      condition: { field: 'rtAudienceRating', operator: 'in', value: [score] },
      item: movie({ rtAudience: score / 10 }),
      expected: true,
    },
  ]),
  ...(
    [
      [8.7, true],
      [7, true],
      [8.8, false],
      [6.9, false],
    ] as const
  ).map(
    ([rtCritic, expected]): LeafCase => ({
      name: `rt between 70 and 87 on ${rtCritic} is ${expected}`,
      condition: {
        field: 'rtCriticRating',
        operator: 'between',
        value: { min: 70, max: 87 },
      },
      item: movie({ rtCritic }),
      expected,
    }),
  ),
  {
    name: 'rt lower bound of 87 includes a stored 8.7',
    condition: {
      field: 'rtCriticRating',
      operator: 'between',
      value: { min: 87 },
    },
    item: movie({ rtCritic: 8.7 }),
    expected: true,
  },
  {
    name: 'a known-missing rating is unevaluated',
    condition: { field: 'tmdbRating', operator: 'greaterThan', value: 1 },
    item: movie({ tmdb: null }),
    expected: null,
  },
  {
    name: 'an unfetched rating is unevaluated',
    condition: { field: 'imdbRating', operator: 'greaterThan', value: 1 },
    item: bareItem,
    expected: null,
  },
]

describe('ratings field', () => {
  it.each(cases)('$name', ({ condition, item, context, expected }) => {
    expect(
      evaluateLeaf(
        condition,
        item,
        { ...BASE_CONTEXT, ...context },
        createMockLogger(),
      ),
    ).toBe(expected)
  })
})
