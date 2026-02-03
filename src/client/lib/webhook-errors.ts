/**
 * Helper to detect webhook callback errors from error messages.
 * Returns true if the error indicates Radarr/Sonarr couldn't reach Pulsarr's webhook endpoint.
 */
export function isWebhookCallbackError(message: string): boolean {
  return (
    message.includes('Unable to send test message') ||
    message.includes('Unable to post to webhook') ||
    message.includes('Connection refused') ||
    message.includes('Name does not resolve')
  )
}
