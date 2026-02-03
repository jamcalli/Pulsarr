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
