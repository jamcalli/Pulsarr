import type { FastifyBaseLogger } from 'fastify'
import safeRegex from 'safe-regex'

/**
 * Evaluates whether the input string matches the provided regex pattern, rejecting unsafe or invalid patterns.
 *
 * @param pattern - The regex pattern to evaluate.
 * @param input - The string to test against the pattern.
 * @param logger - The logger instance for error/warning reporting.
 * @param context - Context string for logging (e.g., 'genre rule', 'certification condition').
 * @returns True if the input matches the pattern and the pattern is safe and valid; otherwise, false.
 *
 * @remark Unsafe regex patterns (as determined by `safe-regex`) and invalid regex syntax are rejected and logged.
 */
export function evaluateRegexSafely(
  pattern: string,
  input: string,
  logger: FastifyBaseLogger,
  context: string,
): boolean {
  // Reject potentially catastrophic patterns using safe-regex
  if (!safeRegex(pattern)) {
    logger.warn({ pattern }, `Rejected unsafe regex in ${context}`)
    return false
  }

  try {
    const regex = new RegExp(pattern)
    return regex.test(input)
  } catch (error) {
    logger.error({ error }, `Invalid regex in ${context}`)
    return false
  }
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
  // Reject potentially catastrophic patterns using safe-regex
  if (!safeRegex(pattern)) {
    logger.warn({ pattern }, `Rejected unsafe regex in ${context}`)
    return false
  }

  try {
    const regex = new RegExp(pattern)
    return inputs.some((input) => regex.test(input))
  } catch (error) {
    logger.error({ error }, `Invalid regex in ${context}`)
    return false
  }
}
