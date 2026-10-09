/**
 * Validation error item from *arr APIs (Radarr/Sonarr)
 * Uses camelCase - serialized by System.Text.Json
 */
interface ArrValidationError {
  propertyName?: string
  errorMessage?: string
  attemptedValue?: unknown
  severity?: string
  errorCode?: string
}

/**
 * Parse error response from Radarr/Sonarr APIs.
 * Handles both formats:
 * - Array: [{ propertyName, errorMessage, ... }] (validation errors)
 * - Object: { message: string } (general errors)
 *
 * Returns the error message string, or empty string if unparseable.
 */
export function parseArrErrorMessage(errorData: unknown): string {
  // Handle array format (validation errors)
  if (Array.isArray(errorData)) {
    const messages = errorData
      .map((e: ArrValidationError) => e.errorMessage)
      .filter(Boolean)
      .join('; ')
    return messages || 'Validation error'
  }

  // Handle object format { message: string }
  if (errorData && typeof errorData === 'object' && 'message' in errorData) {
    return String((errorData as { message: unknown }).message)
  }

  return ''
}

// Sonarr/Radarr return 400 with "This series/movie has already been added"
// when the item already exists.
export function isArrAlreadyAddedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.message.toLowerCase().includes('already been added')
}

const UNREACHABLE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
])

const UNAVAILABLE_STATUSES = new Set([502, 503, 504])

function errorCode(error: Error): string | undefined {
  const own = (error as { code?: unknown }).code
  if (typeof own === 'string') return own
  const cause = error.cause as { code?: unknown } | undefined
  return typeof cause?.code === 'string' ? cause.code : undefined
}

/**
 * Splits a failed *arr add into "the instance could not be reached" and
 * "the instance refused the add", which need different fixes.
 */
export function classifyArrError(error: unknown): {
  category: 'arr_error' | 'instance_unavailable'
  message: string
} {
  if (!(error instanceof Error)) {
    return { category: 'arr_error', message: String(error) }
  }

  const status = (error as { status?: unknown }).status
  const code = errorCode(error)
  const unreachable =
    error.name === 'TimeoutError' ||
    error.name === 'AbortError' ||
    (code !== undefined && UNREACHABLE_CODES.has(code)) ||
    (typeof status === 'number' && UNAVAILABLE_STATUSES.has(status)) ||
    (error instanceof TypeError && error.message === 'fetch failed') ||
    /\b(?:service|instance) \d+ not found\b|\bis not set up\b/i.test(
      error.message,
    )

  return {
    category: unreachable ? 'instance_unavailable' : 'arr_error',
    message: error.message,
  }
}
