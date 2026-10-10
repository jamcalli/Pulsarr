import type { ArrConnectionFailureCode } from '@root/schemas/common/arr-test-connection.schema.js'

export type ConnectionTestResult =
  | { success: true; code: null; message: string }
  | { success: false; code: ArrConnectionFailureCode; message: string }

/** Thrown when the arr rejects the Pulsarr webhook because its test call to Pulsarr failed. */
export class WebhookCallbackError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'WebhookCallbackError'
  }
}
