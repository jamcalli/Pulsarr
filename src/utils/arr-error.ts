import {
  type ArrValidationFailure,
  HttpError,
} from '@root/types/arr-connection.types.js'

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
      .map((e: ArrValidationFailure) => e.errorMessage)
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

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

function toValidationFailure(item: object): ArrValidationFailure {
  return {
    propertyName:
      'propertyName' in item && typeof item.propertyName === 'string'
        ? item.propertyName
        : undefined,
    errorMessage:
      'errorMessage' in item && typeof item.errorMessage === 'string'
        ? item.errorMessage
        : undefined,
    severity:
      'severity' in item && typeof item.severity === 'string'
        ? item.severity
        : undefined,
  }
}

export function parseArrValidationFailures(
  errorData: unknown,
): ArrValidationFailure[] {
  if (!Array.isArray(errorData)) return []
  const items: unknown[] = errorData
  return items.filter(isObject).map(toValidationFailure)
}

/** Reads the arr error body once so every HttpError carries the arr's text and its validation failures. */
export async function arrResponseError(
  response: Response,
  notFound: string,
): Promise<HttpError> {
  if (response.status === 401) {
    return new HttpError('Authentication failed. Check API key.', 401)
  }
  if (response.status === 404) return new HttpError(notFound, 404)
  let detail = response.statusText
  let failures: ArrValidationFailure[] = []
  try {
    const data = await response.json()
    failures = parseArrValidationFailures(data)
    detail = parseArrErrorMessage(data) || detail
  } catch {}
  return new HttpError(detail, response.status, failures)
}

/** The arr wraps HTTP failures into a Url failure and lets socket errors escape as 500. */
export function isWebhookCallbackFailure(error: HttpError): boolean {
  return (
    error.status >= 500 ||
    error.failures.some((failure) => failure.propertyName === 'Url')
  )
}

// Sonarr/Radarr return 400 with "This series/movie has already been added"
// when the item already exists.
export function isArrAlreadyAddedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.message.toLowerCase().includes('already been added')
}
