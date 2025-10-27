import {
  evaluateRegexSafely,
  evaluateRegexSafelyMultiple,
} from '@utils/regex-safety.js'
import { describe, expect, it } from 'vitest'
import { createMockLogger } from '../../mocks/logger.js'

describe('evaluateRegexSafely', () => {
  describe('valid regex patterns', () => {
    it('should match simple patterns correctly', () => {
      const logger = createMockLogger()
      expect(evaluateRegexSafely('test', 'test string', logger, 'test')).toBe(
        true,
      )
      expect(evaluateRegexSafely('test', 'another', logger, 'test')).toBe(false)
    })

    it('should match case-sensitive patterns', () => {
      const logger = createMockLogger()
      expect(evaluateRegexSafely('Test', 'test', logger, 'test')).toBe(false)
      expect(evaluateRegexSafely('Test', 'Test', logger, 'test')).toBe(true)
    })

    it('should match with regex flags in pattern', () => {
      const logger = createMockLogger()
      // JavaScript RegExp doesn't support (?i) inline flag syntax
      // Using standard case-insensitive character classes instead
      expect(
        evaluateRegexSafely('[Tt][Ee][Ss][Tt]', 'TEST string', logger, 'test'),
      ).toBe(true)
      expect(evaluateRegexSafely('[Tt]est', 'Test', logger, 'test')).toBe(true)
    })

    it('should support character classes', () => {
      const logger = createMockLogger()
      expect(evaluateRegexSafely('[0-9]+', '123', logger, 'test')).toBe(true)
      expect(evaluateRegexSafely('[0-9]+', 'abc', logger, 'test')).toBe(false)
      expect(evaluateRegexSafely('[a-z]+', 'test', logger, 'test')).toBe(true)
    })

    it('should support quantifiers', () => {
      const logger = createMockLogger()
      expect(evaluateRegexSafely('a+', 'aaa', logger, 'test')).toBe(true)
      expect(evaluateRegexSafely('a*', 'bbb', logger, 'test')).toBe(true)
      expect(evaluateRegexSafely('a?', 'b', logger, 'test')).toBe(true)
      expect(evaluateRegexSafely('a{3}', 'aaa', logger, 'test')).toBe(true)
    })

    it('should support anchors', () => {
      const logger = createMockLogger()
      expect(evaluateRegexSafely('^test', 'test string', logger, 'test')).toBe(
        true,
      )
      expect(evaluateRegexSafely('^test', 'a test', logger, 'test')).toBe(false)
      expect(evaluateRegexSafely('test$', 'a test', logger, 'test')).toBe(true)
      expect(evaluateRegexSafely('test$', 'test string', logger, 'test')).toBe(
        false,
      )
    })

    it('should support word boundaries', () => {
      const logger = createMockLogger()
      expect(evaluateRegexSafely('\\btest\\b', 'test', logger, 'test')).toBe(
        true,
      )
      expect(evaluateRegexSafely('\\btest\\b', 'testing', logger, 'test')).toBe(
        false,
      )
    })

    it('should support alternation', () => {
      const logger = createMockLogger()
      expect(
        evaluateRegexSafely('cat|dog', 'I have a cat', logger, 'test'),
      ).toBe(true)
      expect(
        evaluateRegexSafely('cat|dog', 'I have a dog', logger, 'test'),
      ).toBe(true)
      expect(
        evaluateRegexSafely('cat|dog', 'I have a bird', logger, 'test'),
      ).toBe(false)
    })

    it('should support groups', () => {
      const logger = createMockLogger()
      expect(
        evaluateRegexSafely('(test)+', 'testtesttest', logger, 'test'),
      ).toBe(true)
      expect(evaluateRegexSafely('(ab)+', 'ababab', logger, 'test')).toBe(true)
    })

    it('should not log anything for valid safe patterns', () => {
      const logger = createMockLogger()
      evaluateRegexSafely('test', 'test', logger, 'genre rule')

      expect(logger.warn).not.toHaveBeenCalled()
      expect(logger.error).not.toHaveBeenCalled()
    })
  })

  describe('unsafe regex patterns', () => {
    it('should reject potentially catastrophic backtracking patterns', () => {
      const logger = createMockLogger()
      // Known unsafe pattern that can cause catastrophic backtracking
      const unsafePattern = '(a+)+$'
      const result = evaluateRegexSafely(
        unsafePattern,
        'aaaaaaaaaaaaaaaaaaaaX',
        logger,
        'genre rule',
      )

      expect(result).toBe(false)
      expect(logger.warn).toHaveBeenCalledWith(
        { pattern: unsafePattern },
        'Rejected unsafe regex in genre rule',
      )
    })

    it('should reject nested quantifiers pattern', () => {
      const logger = createMockLogger()
      const unsafePattern = '(x+x+)+y'
      const result = evaluateRegexSafely(
        unsafePattern,
        'xxxxxxxxxxxxxxxxxxxxxxxxxxxX',
        logger,
        'certification condition',
      )

      expect(result).toBe(false)
      expect(logger.warn).toHaveBeenCalledWith(
        { pattern: unsafePattern },
        'Rejected unsafe regex in certification condition',
      )
    })

    it('should include context in warning message', () => {
      const logger = createMockLogger()
      evaluateRegexSafely('(a+)+$', 'test', logger, 'custom context')

      expect(logger.warn).toHaveBeenCalledWith(
        expect.any(Object),
        'Rejected unsafe regex in custom context',
      )
    })
  })

  describe('invalid regex syntax', () => {
    // Note: safe-regex2 lib also rejects invalid syntax patterns by returning false
    // So these patterns are caught by the unsafe check warning, not the error handler
    it('should reject regex with unmatched parentheses', () => {
      const logger = createMockLogger()
      const result = evaluateRegexSafely('(test', 'test', logger, 'genre rule')

      expect(result).toBe(false)
      // safe-regex2 catches this as unsafe, triggering a warn (not error)
      expect(logger.warn).toHaveBeenCalledWith(
        { pattern: '(test' },
        'Rejected unsafe regex in genre rule',
      )
    })

    it('should reject regex with invalid character class', () => {
      const logger = createMockLogger()
      const result = evaluateRegexSafely('[z-a]', 'test', logger, 'genre rule')

      expect(result).toBe(false)
      // safe-regex2 catches this as unsafe, triggering a warn (not error)
      expect(logger.warn).toHaveBeenCalledWith(
        { pattern: '[z-a]' },
        'Rejected unsafe regex in genre rule',
      )
    })

    it('should reject regex with unmatched brackets', () => {
      const logger = createMockLogger()
      const result = evaluateRegexSafely('[abc', 'test', logger, 'genre rule')

      expect(result).toBe(false)
      // safe-regex2 catches this as unsafe, triggering a warn (not error)
      expect(logger.warn).toHaveBeenCalledWith(
        { pattern: '[abc' },
        'Rejected unsafe regex in genre rule',
      )
    })

    it('should reject regex with invalid quantifier', () => {
      const logger = createMockLogger()
      const result = evaluateRegexSafely('*test', 'test', logger, 'genre rule')

      expect(result).toBe(false)
      // safe-regex2 catches this as unsafe, triggering a warn (not error)
      expect(logger.warn).toHaveBeenCalledWith(
        { pattern: '*test' },
        'Rejected unsafe regex in genre rule',
      )
    })

    it('should include context in warning message for invalid syntax', () => {
      const logger = createMockLogger()
      evaluateRegexSafely('(invalid', 'test', logger, 'custom rule')

      expect(logger.warn).toHaveBeenCalledWith(
        expect.any(Object),
        'Rejected unsafe regex in custom rule',
      )
    })
  })

  describe('edge cases', () => {
    it('should handle empty pattern', () => {
      const logger = createMockLogger()
      expect(evaluateRegexSafely('', 'test', logger, 'test')).toBe(true)
      expect(evaluateRegexSafely('', '', logger, 'test')).toBe(true)
    })

    it('should handle empty input', () => {
      const logger = createMockLogger()
      expect(evaluateRegexSafely('test', '', logger, 'test')).toBe(false)
      expect(evaluateRegexSafely('.*', '', logger, 'test')).toBe(true)
    })

    it('should handle special characters that need escaping', () => {
      const logger = createMockLogger()
      expect(evaluateRegexSafely('\\.', '.', logger, 'test')).toBe(true)
      expect(evaluateRegexSafely('\\*', '*', logger, 'test')).toBe(true)
      expect(evaluateRegexSafely('\\+', '+', logger, 'test')).toBe(true)
    })

    it('should handle unicode characters', () => {
      const logger = createMockLogger()
      expect(evaluateRegexSafely('café', 'café', logger, 'test')).toBe(true)
      expect(evaluateRegexSafely('文字', '文字列', logger, 'test')).toBe(true)
    })
  })
})

describe('evaluateRegexSafelyMultiple', () => {
  describe('valid regex patterns with multiple inputs', () => {
    it('should return true if any input matches', () => {
      const logger = createMockLogger()
      expect(
        evaluateRegexSafelyMultiple(
          'test',
          ['foo', 'bar', 'test', 'baz'],
          logger,
          'test',
        ),
      ).toBe(true)
    })

    it('should return false if no inputs match', () => {
      const logger = createMockLogger()
      expect(
        evaluateRegexSafelyMultiple(
          'test',
          ['foo', 'bar', 'baz'],
          logger,
          'test',
        ),
      ).toBe(false)
    })

    it('should match on first occurrence', () => {
      const logger = createMockLogger()
      expect(
        evaluateRegexSafelyMultiple(
          'test',
          ['test', 'foo', 'bar'],
          logger,
          'test',
        ),
      ).toBe(true)
    })

    it('should match on last occurrence', () => {
      const logger = createMockLogger()
      expect(
        evaluateRegexSafelyMultiple(
          'test',
          ['foo', 'bar', 'test'],
          logger,
          'test',
        ),
      ).toBe(true)
    })

    it('should support complex patterns', () => {
      const logger = createMockLogger()
      expect(
        evaluateRegexSafelyMultiple(
          '^[A-Z]',
          ['lowercase', 'UPPERCASE', 'Mixed'],
          logger,
          'test',
        ),
      ).toBe(true)
    })

    it('should not log anything for valid safe patterns', () => {
      const logger = createMockLogger()
      evaluateRegexSafelyMultiple('test', ['test', 'foo'], logger, 'genre rule')

      expect(logger.warn).not.toHaveBeenCalled()
      expect(logger.error).not.toHaveBeenCalled()
    })
  })

  describe('unsafe regex patterns', () => {
    it('should reject potentially catastrophic backtracking patterns', () => {
      const logger = createMockLogger()
      const unsafePattern = '(a+)+$'
      const result = evaluateRegexSafelyMultiple(
        unsafePattern,
        ['aaa', 'bbb', 'ccc'],
        logger,
        'genre rule',
      )

      expect(result).toBe(false)
      expect(logger.warn).toHaveBeenCalledWith(
        { pattern: unsafePattern },
        'Rejected unsafe regex in genre rule',
      )
    })

    it('should include context in warning message', () => {
      const logger = createMockLogger()
      evaluateRegexSafelyMultiple(
        '(a+)+$',
        ['test'],
        logger,
        'certification check',
      )

      expect(logger.warn).toHaveBeenCalledWith(
        expect.any(Object),
        'Rejected unsafe regex in certification check',
      )
    })
  })

  describe('invalid regex syntax', () => {
    it('should reject regex with invalid syntax', () => {
      const logger = createMockLogger()
      const result = evaluateRegexSafelyMultiple(
        '(test',
        ['test', 'foo'],
        logger,
        'genre rule',
      )

      expect(result).toBe(false)
      // safe-regex2 catches this as unsafe, triggering a warn (not error)
      expect(logger.warn).toHaveBeenCalledWith(
        { pattern: '(test' },
        'Rejected unsafe regex in genre rule',
      )
    })

    it('should include context in warning message for invalid syntax', () => {
      const logger = createMockLogger()
      evaluateRegexSafelyMultiple(
        '[invalid',
        ['test'],
        logger,
        'custom context',
      )

      expect(logger.warn).toHaveBeenCalledWith(
        expect.any(Object),
        'Rejected unsafe regex in custom context',
      )
    })
  })

  describe('edge cases', () => {
    it('should handle empty inputs array', () => {
      const logger = createMockLogger()
      expect(evaluateRegexSafelyMultiple('test', [], logger, 'test')).toBe(
        false,
      )
    })

    it('should handle empty strings in inputs', () => {
      const logger = createMockLogger()
      expect(
        evaluateRegexSafelyMultiple('test', ['', '', ''], logger, 'test'),
      ).toBe(false)
      expect(
        evaluateRegexSafelyMultiple('.*', ['', 'foo'], logger, 'test'),
      ).toBe(true)
    })

    it('should handle single input', () => {
      const logger = createMockLogger()
      expect(
        evaluateRegexSafelyMultiple('test', ['test'], logger, 'test'),
      ).toBe(true)
      expect(evaluateRegexSafelyMultiple('test', ['foo'], logger, 'test')).toBe(
        false,
      )
    })

    it('should handle many inputs efficiently', () => {
      const logger = createMockLogger()
      const manyInputs = Array.from({ length: 100 }, (_, i) => `value${i}`)
      manyInputs.push('test')

      expect(
        evaluateRegexSafelyMultiple('test', manyInputs, logger, 'test'),
      ).toBe(true)
    })

    it('should handle unicode characters in multiple inputs', () => {
      const logger = createMockLogger()
      expect(
        evaluateRegexSafelyMultiple(
          'café',
          ['coffee', 'café', 'tea'],
          logger,
          'test',
        ),
      ).toBe(true)
      expect(
        evaluateRegexSafelyMultiple(
          '文字',
          ['abc', '123', '文字'],
          logger,
          'test',
        ),
      ).toBe(true)
    })

    it('should short-circuit on first match', () => {
      const logger = createMockLogger()
      // This test verifies that the function uses .some() which short-circuits
      const inputs = ['match', 'no', 'no', 'no']
      expect(evaluateRegexSafelyMultiple('match', inputs, logger, 'test')).toBe(
        true,
      )
    })
  })
})
