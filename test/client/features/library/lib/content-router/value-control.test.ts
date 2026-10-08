import type { ConditionOperator } from '@/features/library/lib/content-router/condition-fields'
import {
  storedScalar,
  valueControlFor,
  valueFits,
} from '@/features/library/lib/content-router/value-control'
import type { components } from '@/types/api.js'

function op(
  name: ConditionOperator,
  valueTypes: components['schemas']['ConditionValueType'][],
) {
  return { name, description: name, valueTypes }
}

describe('valueControlFor', () => {
  it('gives list operators chips, sourced when the field has options', () => {
    expect(valueControlFor('genres', op('in', ['string[]']))).toEqual({
      kind: 'chips',
      numeric: false,
      source: 'genres',
    })
    expect(
      valueControlFor('streamingServices', op('in', ['number[]', 'number'])),
    ).toEqual({ kind: 'chips', numeric: true, source: 'streamingServices' })
  })

  it('lets typed chips through for list fields with no option source', () => {
    expect(valueControlFor('year', op('in', ['number[]']))).toEqual({
      kind: 'chips',
      numeric: true,
      source: null,
    })
  })

  it('marks user lists numeric because users are stored by id', () => {
    expect(valueControlFor('user', op('in', ['string[]', 'number[]']))).toEqual(
      { kind: 'chips', numeric: true, source: 'users' },
    )
  })

  it('gives between two number inputs', () => {
    expect(valueControlFor('year', op('between', ['object']))).toEqual({
      kind: 'range',
    })
  })

  it('gives a single number a number input', () => {
    expect(
      valueControlFor('imdbRating', op('greaterThan', ['number'])),
    ).toEqual({ kind: 'number' })
  })

  it('gives a single string with options a select', () => {
    expect(valueControlFor('user', op('equals', ['string', 'number']))).toEqual(
      {
        kind: 'select',
        numeric: true,
        source: 'users',
      },
    )
    expect(valueControlFor('genres', op('contains', ['string']))).toEqual({
      kind: 'select',
      numeric: false,
      source: 'genres',
    })
  })

  it('keeps substring matches and fields without options as free text', () => {
    expect(
      valueControlFor('certification', op('contains', ['string'])),
    ).toEqual({ kind: 'text', regex: false })
    expect(valueControlFor('plexList', op('equals', ['string']))).toEqual({
      kind: 'text',
      regex: false,
    })
  })

  it('gives regex a text input', () => {
    expect(valueControlFor('genres', op('regex', ['string']))).toEqual({
      kind: 'text',
      regex: true,
    })
  })

  it('falls back to text when the operator is unknown', () => {
    expect(valueControlFor('genres', undefined)).toEqual({
      kind: 'text',
      regex: false,
    })
  })
})

describe('storedScalar', () => {
  it('turns numeric strings into numbers only for numeric operators', () => {
    expect(storedScalar('42', true)).toBe(42)
    expect(storedScalar('42', false)).toBe('42')
  })

  it('keeps a username that is not a number', () => {
    expect(storedScalar('alice', true)).toBe('alice')
    expect(storedScalar('', true)).toBe('')
  })
})

describe('valueFits', () => {
  it('matches each control to the value shape it edits', () => {
    expect(
      valueFits(['a'], { kind: 'chips', numeric: false, source: null }),
    ).toBe(true)
    expect(
      valueFits('a', { kind: 'chips', numeric: false, source: null }),
    ).toBe(false)
    expect(valueFits({ min: 1 }, { kind: 'range' })).toBe(true)
    expect(valueFits(undefined, { kind: 'number' })).toBe(true)
    expect(valueFits(3, { kind: 'text', regex: false })).toBe(false)
  })
})
