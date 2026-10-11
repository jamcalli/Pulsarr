/** Thrown when the arr rejects the Pulsarr webhook because its test call to Pulsarr failed. */
export class WebhookCallbackError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'WebhookCallbackError'
  }
}
