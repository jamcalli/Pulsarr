import { toItemId } from '@utils/item-id.js'
import { describe, expect, it } from 'vitest'

describe('toItemId', () => {
  it('parses string ids and passes numbers through', () => {
    expect(toItemId('42')).toBe(42)
    expect(toItemId(7)).toBe(7)
    expect(toItemId('abc')).toBeNaN()
    expect(toItemId(undefined)).toBeUndefined()
  })
})
