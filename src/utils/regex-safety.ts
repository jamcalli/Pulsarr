import type { FastifyBaseLogger } from 'fastify'
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

/**
 * Evaluates whether the input string matches the provided regex pattern, rejecting unsafe or invalid patterns.
 *
 * @param pattern - The regex pattern to evaluate.
 * @param input - The string to test against the pattern.
 * @param logger - The logger instance for error/warning reporting.
 * @param context - Context string for logging (e.g., 'genre rule', 'certification condition').
 * @returns True if the input matches the pattern and the pattern is safe and valid; otherwise, false.
 *
 * @remark Unsafe regex patterns (as determined by `safe-regex2`) and invalid regex syntax are rejected and logged.
 */
export function evaluateRegexSafely(
  pattern: string,
  input: string,
  logger: FastifyBaseLogger,
  context: string,
): boolean {
  // Validate pattern is safe and syntactically valid
  if (!isRegexPatternSafe(pattern)) {
    logger.warn({ pattern }, `Rejected unsafe regex in ${context}`)
    return false
  }

  // Pattern is safe, construct and test (with 'u' flag for consistency with validation)
  const regex = new RegExp(pattern, 'u')
  return regex.test(input)
}

/**
 * Tests if multiple inputs match a regex pattern safely.
 *
 * @param pattern - The regex pattern to evaluate.
 * @param inputs - Array of strings to test against the pattern.
 * @param logger - The logger instance for error/warning reporting.
 * @param context - Context string for logging (e.g., 'genre rule', 'certification condition').
 * @returns True if any input matches the pattern and the pattern is safe and valid; otherwise, false.
 */
export function evaluateRegexSafelyMultiple(
  pattern: string,
  inputs: string[],
  logger: FastifyBaseLogger,
  context: string,
): boolean {
  // Validate pattern is safe and syntactically valid
  if (!isRegexPatternSafe(pattern)) {
    logger.warn({ pattern }, `Rejected unsafe regex in ${context}`)
    return false
  }

  // Pattern is safe, construct and test (with 'u' flag for consistency with validation)
  const regex = new RegExp(pattern, 'u')
  return inputs.some((input) => regex.test(input))
}
