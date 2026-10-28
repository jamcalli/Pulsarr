import { toBoolean } from '@utils/to-boolean.js'
import { describe, expect, it } from 'vitest'

describe('toBoolean', () => {
  it('returns the default for null and undefined', () => {
    expect(toBoolean(null, true)).toBe(true)
    expect(toBoolean(undefined, true)).toBe(true)
    expect(toBoolean(null, false)).toBe(false)
    expect(toBoolean(undefined, false)).toBe(false)
  })

  it('keeps 0 and false as false even when the default is true', () => {
    expect(toBoolean(0, true)).toBe(false)
    expect(toBoolean(false, true)).toBe(false)
  })

  it('returns true for 1 and true even when the default is false', () => {
    expect(toBoolean(1, false)).toBe(true)
    expect(toBoolean(true, false)).toBe(true)
  })
})
