import { isRegexPatternSafe } from '@root/schemas/shared/regex-validation.schema.js'
import type { FastifyBaseLogger } from 'fastify'

export { isRegexPatternSafe }

/** Null when the pattern is unsafe or invalid, which is logged and never run. */
export function evaluateRegexSafely(
  pattern: string,
  input: string,
  logger: FastifyBaseLogger,
  context: string,
): boolean | null {
  if (!isRegexPatternSafe(pattern)) {
    logger.warn({ pattern }, `Rejected unsafe regex in ${context}`)
    return null
  }

  // u matches the validator's flags and i keeps every router match case-insensitive
  const regex = new RegExp(pattern, 'iu')
  return regex.test(input)
}

/** True when any input matches, null when the pattern is unsafe or invalid. */
export function evaluateRegexSafelyMultiple(
  pattern: string,
  inputs: readonly string[],
  logger: FastifyBaseLogger,
  context: string,
): boolean | null {
  if (!isRegexPatternSafe(pattern)) {
    logger.warn({ pattern }, `Rejected unsafe regex in ${context}`)
    return null
  }

  // u matches the validator's flags and i keeps every router match case-insensitive
  const regex = new RegExp(pattern, 'iu')
  return inputs.some((input) => regex.test(input))
}
