import { evaluateLeaf } from '@services/content-router/conditions.js'
import { describe, expect, it } from 'vitest'
import {
  BASE_CONTEXT,
  bareItem,
  type LeafCase,
  movie,
  provider,
} from '../../../../mocks/content-router-items.js'
import { createMockLogger } from '../../../../mocks/logger.js'

const onNetflix = movie({
  watchProviders: { flatrate: [provider(8, 'Netflix')] },
})
const noFlatrate = movie({ watchProviders: {} })

const cases: LeafCase[] = [
  {
    name: 'in matches a listed provider',
    condition: { field: 'streamingServices', operator: 'in', value: [8, 337] },
    item: onNetflix,
    expected: true,
  },
  {
    name: 'in accepts a single provider id',
    condition: { field: 'streamingServices', operator: 'in', value: 8 },
    item: onNetflix,
    expected: true,
  },
  {
    name: 'notIn rejects a listed provider',
    condition: { field: 'streamingServices', operator: 'notIn', value: [8] },
    item: onNetflix,
    expected: false,
  },
  {
    name: 'notIn matches an unlisted provider',
    condition: { field: 'streamingServices', operator: 'notIn', value: 337 },
    item: onNetflix,
    expected: true,
  },
  {
    name: 'an empty provider list is rejected',
    condition: { field: 'streamingServices', operator: 'notIn', value: [] },
    item: onNetflix,
    expected: false,
  },
  {
    name: 'a string provider id is rejected',
    condition: { field: 'streamingServices', operator: 'in', value: '8' },
    item: onNetflix,
    expected: false,
  },
  {
    name: 'no flatrate list is present data',
    condition: { field: 'streamingServices', operator: 'notIn', value: [8] },
    item: noFlatrate,
    expected: true,
  },
  {
    name: 'unfetched providers are missing data',
    condition: { field: 'streamingServices', operator: 'notIn', value: [8] },
    item: bareItem,
    expected: null,
  },
]

describe('streamingServices field', () => {
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
