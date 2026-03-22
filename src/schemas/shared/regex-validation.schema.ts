import safeRegex from 'safe-regex2'

/**
 * Validates that a regex pattern is safe and syntactically valid.
 *
 * @param pattern - The regex pattern to validate.
 * @returns True if the pattern is safe and valid; otherwise, false.
 *
 * @remark This only validates the pattern itself, does not test against input.
 * Uses safe-regex2 to detect catastrophic backtracking patterns and validates syntax.
 * Tests with unicode flag for strict validation of modern JavaScript regex syntax.
 * Enforces maximum length to prevent pathologically large patterns.
 */
export function isRegexPatternSafe(pattern: string): boolean {
  // Normalize and validate pattern
  const p = (pattern ?? '').trim()

  // Allow empty strings (treated as disabled/not set)
  if (p.length === 0) {
    return true
  }

  // Reject patterns that are too long (defense-in-depth)
  if (p.length > 1024) {
    return false
  }

  // Reject potentially catastrophic patterns using safe-regex2
  if (!safeRegex(p)) {
    return false
  }

  // Verify the regex syntax is valid in both standard and unicode mode
  try {
    new RegExp(p)
    // Also test with unicode flag for stricter validation
    // This catches invalid syntax like {,5} that would be accepted in non-unicode mode
    new RegExp(p, 'u')
    return true
  } catch {
    return false
  }
}
