import { safeSecretCompare } from '@utils/webhook-secret.js'
import { describe, expect, it } from 'vitest'

describe('safeSecretCompare', () => {
  it('accepts an exact match', () => {
    expect(safeSecretCompare('super-secret', 'super-secret')).toBe(true)
  })

  it('rejects a mismatch of equal length', () => {
    expect(safeSecretCompare('super-secreX', 'super-secret')).toBe(false)
  })

  it('rejects when provided is shorter than expected', () => {
    expect(safeSecretCompare('super', 'super-secret')).toBe(false)
  })

  it('rejects when provided is longer than expected', () => {
    expect(safeSecretCompare('super-secret-plus', 'super-secret')).toBe(false)
  })

  it('rejects a null-padded superset that matches through the padding', () => {
    // Zero-padding makes these buffers compare equal - only the length
    // check separates them
    expect(safeSecretCompare('super-secret\0', 'super-secret')).toBe(false)
  })

  it('rejects undefined and empty inputs', () => {
    expect(safeSecretCompare(undefined, 'super-secret')).toBe(false)
    expect(safeSecretCompare('', 'super-secret')).toBe(false)
  })

  it('rejects array header values', () => {
    expect(
      safeSecretCompare(['super-secret', 'super-secret'], 'super-secret'),
    ).toBe(false)
  })

  it('rejects everything when the configured secret is empty', () => {
    expect(safeSecretCompare('anything', '')).toBe(false)
    expect(safeSecretCompare('', '')).toBe(false)
  })

  it('compares multibyte secrets by bytes, not characters', () => {
    expect(safeSecretCompare('sécret', 'sécret')).toBe(true)
    expect(safeSecretCompare('sécret', 'secret')).toBe(false)
  })
})
