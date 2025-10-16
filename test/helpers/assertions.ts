import { expect } from 'vitest'

/**
 * Helper to assert validation errors in API responses
 *
 * @param statusCode - The HTTP status code from the response
 * @param payload - The response payload as a JSON string
 * @param expectedMessage - The expected error message (or substring)
 */
export function expectValidationError(
  statusCode: number,
  payload: string,
  expectedMessage: string,
) {
  expect(statusCode).toBe(400)
  const { message } = JSON.parse(payload)
  expect(message).toContain(expectedMessage)
}
