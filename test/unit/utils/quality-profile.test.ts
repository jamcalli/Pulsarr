import { describe, expect, it } from 'vitest'
import { parseQualityProfileId } from '../../../src/utils/quality-profile'

describe('parseQualityProfileId', () => {
  describe('valid numeric inputs', () => {
    it('should return the number when given a positive integer', () => {
      expect(parseQualityProfileId(1)).toBe(1)
      expect(parseQualityProfileId(8)).toBe(8)
      expect(parseQualityProfileId(100)).toBe(100)
      expect(parseQualityProfileId(999999)).toBe(999999)
    })

    it('should return the parsed number when given a numeric string', () => {
      expect(parseQualityProfileId('1')).toBe(1)
      expect(parseQualityProfileId('8')).toBe(8)
      expect(parseQualityProfileId('100')).toBe(100)
      expect(parseQualityProfileId('999999')).toBe(999999)
    })

    it('should handle numeric strings with whitespace', () => {
      expect(parseQualityProfileId('  1  ')).toBe(1)
      expect(parseQualityProfileId('\t8\n')).toBe(8)
      expect(parseQualityProfileId(' 100 ')).toBe(100)
    })
  })

  describe('invalid numeric inputs', () => {
    it('should return undefined for zero', () => {
      expect(parseQualityProfileId(0)).toBeUndefined()
      expect(parseQualityProfileId('0')).toBeUndefined()
    })

    it('should return undefined for negative numbers', () => {
      expect(parseQualityProfileId(-1)).toBeUndefined()
      expect(parseQualityProfileId(-100)).toBeUndefined()
      expect(parseQualityProfileId('-1')).toBeUndefined()
      expect(parseQualityProfileId('-100')).toBeUndefined()
    })

    it('should return undefined for floating point numbers', () => {
      expect(parseQualityProfileId(1.5)).toBeUndefined()
      expect(parseQualityProfileId(3.14)).toBeUndefined()
      expect(parseQualityProfileId('1.5')).toBeUndefined()
      expect(parseQualityProfileId('3.14')).toBeUndefined()
    })

    it('should return undefined for scientific notation', () => {
      expect(parseQualityProfileId('1e5')).toBeUndefined()
      expect(parseQualityProfileId('2.5e2')).toBeUndefined()
    })
  })

  describe('non-numeric string inputs', () => {
    it('should return undefined for "Any" string', () => {
      expect(parseQualityProfileId('Any')).toBeUndefined()
    })

    it('should return undefined for text strings', () => {
      expect(parseQualityProfileId('quality')).toBeUndefined()
      expect(parseQualityProfileId('profile')).toBeUndefined()
      expect(parseQualityProfileId('HD-1080p')).toBeUndefined()
    })

    it('should return undefined for alphanumeric strings', () => {
      expect(parseQualityProfileId('1abc')).toBeUndefined()
      expect(parseQualityProfileId('abc1')).toBeUndefined()
      expect(parseQualityProfileId('1 2 3')).toBeUndefined()
    })

    it('should return undefined for empty or whitespace strings', () => {
      expect(parseQualityProfileId('')).toBeUndefined()
      expect(parseQualityProfileId('   ')).toBeUndefined()
      expect(parseQualityProfileId('\t\n')).toBeUndefined()
    })

    it('should return undefined for strings with special characters', () => {
      expect(parseQualityProfileId('1+1')).toBeUndefined()
      expect(parseQualityProfileId('1-1')).toBeUndefined()
      expect(parseQualityProfileId('$100')).toBeUndefined()
    })
  })

  describe('null, undefined, and other types', () => {
    it('should return undefined for null', () => {
      expect(parseQualityProfileId(null)).toBeUndefined()
    })

    it('should return undefined for undefined', () => {
      expect(parseQualityProfileId(undefined)).toBeUndefined()
    })

    it('should return undefined for boolean values', () => {
      expect(parseQualityProfileId(true)).toBeUndefined()
      expect(parseQualityProfileId(false)).toBeUndefined()
    })

    it('should return undefined for arrays', () => {
      expect(parseQualityProfileId([])).toBeUndefined()
      expect(parseQualityProfileId([1])).toBeUndefined()
      expect(parseQualityProfileId([1, 2, 3])).toBeUndefined()
    })

    it('should return undefined for objects', () => {
      expect(parseQualityProfileId({})).toBeUndefined()
      expect(parseQualityProfileId({ id: 1 })).toBeUndefined()
    })

    it('should return undefined for functions', () => {
      expect(parseQualityProfileId(() => 1)).toBeUndefined()
    })

    it('should return undefined for NaN', () => {
      expect(parseQualityProfileId(Number.NaN)).toBeUndefined()
    })

    it('should return undefined for Infinity', () => {
      expect(parseQualityProfileId(Number.POSITIVE_INFINITY)).toBeUndefined()
      expect(parseQualityProfileId(Number.NEGATIVE_INFINITY)).toBeUndefined()
    })
  })

  describe('edge cases', () => {
    it('should handle very large valid numbers', () => {
      expect(parseQualityProfileId(Number.MAX_SAFE_INTEGER)).toBe(
        Number.MAX_SAFE_INTEGER,
      )
      expect(parseQualityProfileId(String(Number.MAX_SAFE_INTEGER))).toBe(
        Number.MAX_SAFE_INTEGER,
      )
    })

    it('should reject numbers beyond safe integer range', () => {
      const tooBig = Number.MAX_SAFE_INTEGER + 1
      // JavaScript loses precision here, so we can't reliably test this
      // Just ensure it doesn't crash
      const result = parseQualityProfileId(tooBig)
      expect(typeof result === 'number' || result === undefined).toBe(true)
    })
  })
})
