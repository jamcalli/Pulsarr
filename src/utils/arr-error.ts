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

export interface ArrErrorResult {
  message: string
  isWebhookCallbackError: boolean
}

/**
 * Parse error response from Radarr/Sonarr APIs.
 * Handles both formats:
 * - Array: [{ propertyName, errorMessage, ... }] (validation errors)
 * - Object: { message: string } (general errors)
 */
export function parseArrErrorResponse(errorData: unknown): ArrErrorResult {
  // Handle array format (validation errors)
  if (Array.isArray(errorData)) {
    const urlError = errorData.find(
      (e: ArrValidationError) =>
        e.propertyName === 'Url' &&
        e.errorMessage?.includes('Unable to send test message'),
    )
    if (urlError) {
      return {
        message:
          (urlError as ArrValidationError).errorMessage ||
          'Webhook callback failed',
        isWebhookCallbackError: true,
      }
    }
    // Join all error messages for non-webhook validation errors
    const messages = errorData
      .map((e: ArrValidationError) => e.errorMessage)
      .filter(Boolean)
      .join('; ')
    return {
      message: messages || 'Validation error',
      isWebhookCallbackError: false,
    }
  }

  // Handle object format { message: string }
  if (errorData && typeof errorData === 'object' && 'message' in errorData) {
    return {
      message: String((errorData as { message: unknown }).message),
      isWebhookCallbackError: false,
    }
  }

  return { message: '', isWebhookCallbackError: false }
}
