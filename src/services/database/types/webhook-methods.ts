import type {
  PendingWebhook,
  PendingWebhookCreate,
} from '@root/types/pending-webhooks.types.js'

declare module '../../database.service.js' {
  interface DatabaseService {
    // PENDING WEBHOOKS METHODS
    /**
     * Creates a new pending webhook entry
     * @param webhook - The webhook data to create
     * @returns Promise resolving to the created webhook with its ID
     */
    createPendingWebhook(webhook: PendingWebhookCreate): Promise<PendingWebhook>

    /**
     * Gets all pending webhooks that haven't expired
     * @param limit - Optional limit of results (default: 50)
     * @returns Promise resolving to array of pending webhooks
     */
    getPendingWebhooks(limit?: number): Promise<PendingWebhook[]>

    /**
     * Deletes a processed webhook
     * @param id - The webhook ID to delete
     * @returns Promise resolving to boolean indicating success
     */
    deletePendingWebhook(id: number): Promise<boolean>

    /**
     * Cleans up expired webhooks
     * @returns Promise resolving to number of deleted webhooks
     */
    cleanupExpiredWebhooks(): Promise<number>

    /**
     * Gets webhooks by GUID and media type
     * @param guid - The GUID to search for
     * @param mediaType - The media type (movie or show)
     * @returns Promise resolving to array of pending webhooks
     */
    getWebhooksByGuid(
      guid: string,
      mediaType: 'movie' | 'show',
    ): Promise<PendingWebhook[]>
  }
}
