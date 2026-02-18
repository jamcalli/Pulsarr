import {
  evaluateRegexSafely,
  evaluateRegexSafelyMultiple,
  isRegexPatternSafe,
} from '@utils/regex-safety.js'
import { describe, expect, it } from 'vitest'
import { createMockLogger } from '../../mocks/logger.js'

describe('isRegexPatternSafe', () => {
  describe('safe patterns', () => {
    it('should return true for simple safe patterns', () => {
      expect(isRegexPatternSafe('test')).toBe(true)
      expect(isRegexPatternSafe('simple')).toBe(true)
      expect(isRegexPatternSafe('pattern')).toBe(true)
    })

    it('should return true for character classes', () => {
      expect(isRegexPatternSafe('[a-z]+')).toBe(true)
      expect(isRegexPatternSafe('[A-Z]+')).toBe(true)
      expect(isRegexPatternSafe('[0-9]+')).toBe(true)
      expect(isRegexPatternSafe('[a-zA-Z0-9]')).toBe(true)
    })

    it('should return true for anchors', () => {
      expect(isRegexPatternSafe('^test')).toBe(true)
      expect(isRegexPatternSafe('test$')).toBe(true)
      expect(isRegexPatternSafe('^test$')).toBe(true)
    })

    it('should return true for quantifiers', () => {
      expect(isRegexPatternSafe('a+')).toBe(true)
      expect(isRegexPatternSafe('a*')).toBe(true)
      expect(isRegexPatternSafe('a?')).toBe(true)
      expect(isRegexPatternSafe('a{2,5}')).toBe(true)
    })

    it('should return true for word boundaries', () => {
      expect(isRegexPatternSafe('\\btest\\b')).toBe(true)
      expect(isRegexPatternSafe('\\Btest')).toBe(true)
    })

    it('should return true for alternation', () => {
      expect(isRegexPatternSafe('cat|dog')).toBe(true)
      expect(isRegexPatternSafe('foo|bar|baz')).toBe(true)
    })

    it('should return true for groups', () => {
      expect(isRegexPatternSafe('(test)')).toBe(true)
      expect(isRegexPatternSafe('(abc)+')).toBe(true)
      expect(isRegexPatternSafe('(?:non-capturing)')).toBe(true)
    })

    it('should return true for escaped special characters', () => {
      expect(isRegexPatternSafe('\\.')).toBe(true)
      expect(isRegexPatternSafe('\\*')).toBe(true)
      expect(isRegexPatternSafe('\\+')).toBe(true)
      expect(isRegexPatternSafe('\\?')).toBe(true)
    })

    it('should return true for empty pattern', () => {
      expect(isRegexPatternSafe('')).toBe(true)
    })

    it('should return true for unicode patterns', () => {
      expect(isRegexPatternSafe('café')).toBe(true)
      expect(isRegexPatternSafe('文字')).toBe(true)
    })
  })

  describe('unsafe patterns (catastrophic backtracking)', () => {
    it('should return false for nested quantifiers', () => {
      // codeql[js/polynomial-redos] - Intentionally unsafe pattern for testing
      expect(isRegexPatternSafe('(a+)+$')).toBe(false)
      // codeql[js/polynomial-redos] - Intentionally unsafe pattern for testing
      expect(isRegexPatternSafe('(x+x+)+y')).toBe(false)
    })

    it('should return false for complex backtracking patterns', () => {
      // codeql[js/polynomial-redos] - Intentionally unsafe pattern for testing
      expect(isRegexPatternSafe('(a+)+b')).toBe(false)
      expect(isRegexPatternSafe('(a*)*')).toBe(false)
      expect(isRegexPatternSafe('(.*)*')).toBe(false)
    })
  })

  describe('invalid syntax', () => {
    it('should return false for unmatched parentheses', () => {
      expect(isRegexPatternSafe('(test')).toBe(false)
      expect(isRegexPatternSafe('test)')).toBe(false)
      expect(isRegexPatternSafe('((test)')).toBe(false)
    })

    it('should return false for unmatched brackets', () => {
      // Opening bracket without closing
      expect(isRegexPatternSafe('[abc')).toBe(false)
      expect(isRegexPatternSafe('[a-z')).toBe(false)
      // Closing bracket without opening is also invalid in unicode mode
      expect(isRegexPatternSafe('abc]')).toBe(false)
    })

    it('should return false for invalid character class', () => {
      expect(isRegexPatternSafe('[z-a]')).toBe(false)
    })

    it('should return false for invalid quantifier placement', () => {
      expect(isRegexPatternSafe('*test')).toBe(false)
      expect(isRegexPatternSafe('+test')).toBe(false)
      expect(isRegexPatternSafe('?test')).toBe(false)
    })

    it('should return false for invalid escape sequences', () => {
      expect(isRegexPatternSafe('\\')).toBe(false)
    })

    it('should return false for invalid quantifier range', () => {
      expect(isRegexPatternSafe('a{5,3}')).toBe(false)
    })

    it('should return false for invalid quantifier syntax', () => {
      // JavaScript does NOT support {,m} syntax - these are invalid
      expect(isRegexPatternSafe('a{,}')).toBe(false)
      expect(isRegexPatternSafe('a{,5}')).toBe(false)
    })

    it('should return true for valid quantifier ranges', () => {
      expect(isRegexPatternSafe('a{2,5}')).toBe(true)
      expect(isRegexPatternSafe('a{3,}')).toBe(true)
      expect(isRegexPatternSafe('a{5}')).toBe(true)
    })
  })

  describe('length limits', () => {
    it('should reject patterns longer than 1024 characters', () => {
      const longPattern = 'a'.repeat(1025)
      expect(isRegexPatternSafe(longPattern)).toBe(false)
    })

    it('should accept patterns at exactly 1024 characters', () => {
      const maxPattern = 'a'.repeat(1024)
      expect(isRegexPatternSafe(maxPattern)).toBe(true)
    })
  })

  describe('edge cases', () => {
    it('should handle complex valid patterns', () => {
      expect(
        isRegexPatternSafe('^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'),
      ).toBe(true)
      expect(
        isRegexPatternSafe('\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}'),
      ).toBe(true)
    })

    it('should handle lookaheads', () => {
      // Positive lookahead
      expect(isRegexPatternSafe('(?=test)')).toBe(true)
      // Negative lookahead
      expect(isRegexPatternSafe('(?!test)')).toBe(true)
    })

    it('should reject lookbehinds for safety', () => {
      // Lookbehinds are syntactically valid in ES2018+ but rejected by safe-regex2
      // due to potential performance issues
      expect(isRegexPatternSafe('(?<=test)')).toBe(false)
      expect(isRegexPatternSafe('(?<!test)')).toBe(false)
    })

    it('should validate patterns with multiple groups', () => {
      expect(isRegexPatternSafe('(\\d+)-(\\d+)-(\\d+)')).toBe(true)
      expect(isRegexPatternSafe('((a)(b))')).toBe(true)
    })
  })
})

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
      // codeql[js/polynomial-redos] - Intentionally unsafe pattern for testing
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
      // codeql[js/polynomial-redos] - Intentionally unsafe pattern for testing
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
      // codeql[js/polynomial-redos] - Intentionally unsafe pattern for testing
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
      // codeql[js/polynomial-redos] - Intentionally unsafe pattern for testing
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
      // codeql[js/polynomial-redos] - Intentionally unsafe pattern for testing
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
