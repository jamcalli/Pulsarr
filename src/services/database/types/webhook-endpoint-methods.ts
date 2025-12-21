import type {
  CreateWebhookEndpoint,
  UpdateWebhookEndpoint,
  WebhookEndpoint,
  WebhookEventType,
} from '@root/types/webhook-endpoint.types.js'

declare module '@services/database.service.js' {
  interface DatabaseService {
    // WEBHOOK ENDPOINT METHODS

    /**
     * Retrieves all enabled webhook endpoints subscribed to a specific event type
     * @param eventType - The event type to filter by
     * @returns Array of webhook endpoints subscribed to the event
     */
    getWebhookEndpointsForEvent(
      eventType: WebhookEventType,
    ): Promise<WebhookEndpoint[]>

    /**
     * Retrieves all webhook endpoints ordered by creation date
     * @returns Array of all webhook endpoints
     */
    getAllWebhookEndpoints(): Promise<WebhookEndpoint[]>

    /**
     * Retrieves a single webhook endpoint by ID
     * @param id - The endpoint ID
     * @returns The webhook endpoint or null if not found
     */
    getWebhookEndpointById(id: number): Promise<WebhookEndpoint | null>

    /**
     * Creates a new webhook endpoint
     * @param endpoint - The endpoint data to create
     * @returns The created webhook endpoint
     */
    createWebhookEndpoint(
      endpoint: CreateWebhookEndpoint,
    ): Promise<WebhookEndpoint>

    /**
     * Updates an existing webhook endpoint
     * @param id - The endpoint ID to update
     * @param updates - The fields to update
     * @returns The updated webhook endpoint or null if not found
     */
    updateWebhookEndpoint(
      id: number,
      updates: UpdateWebhookEndpoint,
    ): Promise<WebhookEndpoint | null>

    /**
     * Deletes a webhook endpoint by ID
     * @param id - The endpoint ID to delete
     * @returns True if deleted, false if not found
     */
    deleteWebhookEndpoint(id: number): Promise<boolean>
  }
}
