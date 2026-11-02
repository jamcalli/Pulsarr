import { parseJsonOr } from '@utils/json.js'
import { describe, expect, it } from 'vitest'
import { createMockLogger } from '../../mocks/logger.js'

describe('parseJsonOr', () => {
  it('parses valid JSON', () => {
    expect(parseJsonOr('{"a":[1,2]}', {})).toEqual({ a: [1, 2] })
    expect(parseJsonOr('[]', ['fallback'])).toEqual([])
  })

  it('returns the fallback for null, undefined and empty string', () => {
    expect(parseJsonOr(null, ['x'])).toEqual(['x'])
    expect(parseJsonOr(undefined, ['x'])).toEqual(['x'])
    expect(parseJsonOr('', ['x'])).toEqual(['x'])
  })

  it('returns the fallback on invalid JSON', () => {
    const fallback = { ok: false }
    expect(parseJsonOr('{not json', fallback, createMockLogger(), 'ctx')).toBe(
      fallback,
    )
    expect(parseJsonOr('{not json', fallback)).toBe(fallback)
  })
})
