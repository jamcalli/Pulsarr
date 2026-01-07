import { normalizeTagLabel } from '@utils/tag-normalization.js'
import { describe, expect, it } from 'vitest'

describe('tag-normalization', () => {
  describe('normalizeTagLabel', () => {
    describe('lowercase conversion', () => {
      it('should convert uppercase to lowercase', () => {
        expect(normalizeTagLabel('UPPERCASE')).toBe('uppercase')
      })

      it('should convert mixed case to lowercase', () => {
        expect(normalizeTagLabel('MixedCase')).toBe('mixedcase')
      })

      it('should preserve already lowercase', () => {
        expect(normalizeTagLabel('lowercase')).toBe('lowercase')
      })
    })

    describe('special character replacement', () => {
      it('should replace colons with hyphens', () => {
        expect(normalizeTagLabel('Pulsarr:User:John')).toBe('pulsarr-user-john')
      })

      it('should replace dots with hyphens', () => {
        expect(normalizeTagLabel('My.Tag.Name')).toBe('my-tag-name')
      })

      it('should replace underscores with hyphens', () => {
        expect(normalizeTagLabel('My_Tag_Name')).toBe('my-tag-name')
      })

      it('should replace spaces with hyphens', () => {
        expect(normalizeTagLabel('My Tag Name')).toBe('my-tag-name')
      })

      it('should replace mixed special characters', () => {
        expect(normalizeTagLabel('My.Tag_Name:Here')).toBe('my-tag-name-here')
      })
    })

    describe('hyphen collapsing', () => {
      it('should collapse multiple consecutive hyphens', () => {
        expect(normalizeTagLabel('test--tag')).toBe('test-tag')
      })

      it('should collapse many consecutive hyphens', () => {
        expect(normalizeTagLabel('test-----tag')).toBe('test-tag')
      })

      it('should collapse hyphens created from special chars', () => {
        expect(normalizeTagLabel('test::tag')).toBe('test-tag')
      })
    })

    describe('leading and trailing hyphen trimming', () => {
      it('should trim leading hyphens', () => {
        expect(normalizeTagLabel('--test')).toBe('test')
      })

      it('should trim trailing hyphens', () => {
        expect(normalizeTagLabel('test--')).toBe('test')
      })

      it('should trim both leading and trailing hyphens', () => {
        expect(normalizeTagLabel('--test--')).toBe('test')
      })

      it('should trim hyphens created from special chars at edges', () => {
        expect(normalizeTagLabel(':test:')).toBe('test')
      })
    })

    describe('numbers', () => {
      it('should preserve numbers', () => {
        expect(normalizeTagLabel('tag123')).toBe('tag123')
      })

      it('should handle numbers at start', () => {
        expect(normalizeTagLabel('123tag')).toBe('123tag')
      })

      it('should handle mixed numbers and special chars', () => {
        expect(normalizeTagLabel('tag:123:name')).toBe('tag-123-name')
      })
    })

    describe('edge cases', () => {
      it('should handle empty string', () => {
        expect(normalizeTagLabel('')).toBe('')
      })

      it('should handle string with only special chars', () => {
        expect(normalizeTagLabel(':::')).toBe('')
      })

      it('should handle already normalized tag', () => {
        expect(normalizeTagLabel('already-normalized')).toBe(
          'already-normalized',
        )
      })

      it('should handle single character', () => {
        expect(normalizeTagLabel('a')).toBe('a')
      })

      it('should handle single hyphen', () => {
        expect(normalizeTagLabel('-')).toBe('')
      })
    })

    describe('real-world examples', () => {
      it('should normalize pulsarr user label format', () => {
        expect(normalizeTagLabel('pulsarr:john-doe')).toBe('pulsarr-john-doe')
      })

      it('should normalize tag with email-like format', () => {
        expect(normalizeTagLabel('user@domain')).toBe('user-domain')
      })

      it('should normalize tag with parentheses', () => {
        expect(normalizeTagLabel('tag(1)')).toBe('tag-1')
      })

      it('should normalize tag with brackets', () => {
        expect(normalizeTagLabel('tag[special]')).toBe('tag-special')
      })
    })
  })
})
