import { evaluateLeaf } from '@services/content-router/conditions.js'
import { describe, expect, it } from 'vitest'
import {
  BASE_CONTEXT,
  type LeafCase,
  movie,
  SHOW_CONTEXT,
  show,
} from '../../../../mocks/content-router-items.js'
import { createMockLogger } from '../../../../mocks/logger.js'

const english = movie({}, { originalLanguage: { id: 1, name: 'English' } })

const cases: LeafCase[] = [
  {
    name: 'regex matches a lowercase pattern against a mixed-case language',
    condition: { field: 'language', operator: 'regex', value: '^english$' },
    item: english,
    expected: true,
  },
  {
    name: 'equals folds case',
    condition: { field: 'language', operator: 'equals', value: 'ENGLISH' },
    item: english,
    expected: true,
  },
  {
    name: 'contains matches a substring',
    condition: { field: 'language', operator: 'contains', value: 'glis' },
    item: english,
    expected: true,
  },
  {
    name: 'in matches a listed language',
    condition: {
      field: 'language',
      operator: 'in',
      value: ['French', 'english'],
    },
    item: english,
    expected: true,
  },
  {
    name: 'notIn matches an unlisted language',
    condition: { field: 'language', operator: 'notIn', value: ['French'] },
    item: english,
    expected: true,
  },
  {
    name: 'a show language is read too',
    condition: { field: 'language', operator: 'equals', value: 'japanese' },
    item: show({}, { originalLanguage: { id: 8, name: 'Japanese' } }),
    context: SHOW_CONTEXT,
    expected: true,
  },
  {
    name: 'no original language is missing data',
    condition: { field: 'language', operator: 'notEquals', value: 'French' },
    item: movie(),
    expected: null,
  },
]

describe('language field', () => {
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
