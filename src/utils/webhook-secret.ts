import { timingSafeEqual } from 'node:crypto'

/**
 * Timing-safe string comparison to prevent timing attacks.
 * Pads shorter string to match length before comparison.
 */
export function safeSecretCompare(
  provided: string | string[] | undefined,
  expected: string,
): boolean {
  if (!provided || Array.isArray(provided)) return false
  const providedBuf = Buffer.from(provided)
  const expectedBuf = Buffer.from(expected)
  // Pad to same length to prevent length-based timing leaks
  const maxLen = Math.max(providedBuf.length, expectedBuf.length)
  const paddedProvided = Buffer.alloc(maxLen)
  const paddedExpected = Buffer.alloc(maxLen)
  providedBuf.copy(paddedProvided)
  expectedBuf.copy(paddedExpected)
  // Always compare, then check length match
  const match = timingSafeEqual(paddedProvided, paddedExpected)
  return match && providedBuf.length === expectedBuf.length
}
