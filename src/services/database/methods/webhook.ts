import type {
  PendingWebhook,
  PendingWebhookCreate,
} from '@root/types/pending-webhooks.types.js'
import type { DatabaseService } from '@services/database.service.js'

/**
 * Inserts a new pending webhook record into the database and returns the created entry with its assigned ID.
 *
 * @param webhook - The webhook data to be stored, including expiration and payload information.
 * @returns The newly created pending webhook, including its generated ID and timestamp fields as Date objects.
 */
export async function createPendingWebhook(
  this: DatabaseService,
  webhook: PendingWebhookCreate,
): Promise<PendingWebhook> {
  try {
    const receivedAt = this.timestamp
    const result = await this.knex('pending_webhooks')
      .insert({
        ...webhook,
        received_at: receivedAt,
        expires_at: webhook.expires_at.toISOString(),
        payload: JSON.stringify(webhook.payload),
      })
      .returning('id')

    const id = this.extractId(result)

    return {
      id,
      ...webhook,
      received_at: new Date(receivedAt),
      expires_at: webhook.expires_at,
    }
  } catch (error) {
    this.log.error({ error }, 'Error creating pending webhook:')
    throw new Error('Failed to create pending webhook')
  }
}

/**
 * Retrieves all pending webhooks that have not expired, up to a specified limit.
 *
 * Safely parses each webhook's payload and converts timestamp fields to Date objects. Returns an empty array if an error occurs.
 *
 * @param limit - Maximum number of webhooks to retrieve (default: 50)
 * @returns An array of pending webhook objects
 */
export async function getPendingWebhooks(
  this: DatabaseService,
  limit = 50,
): Promise<PendingWebhook[]> {
  try {
    const webhooks = await this.knex('pending_webhooks')
      .where('expires_at', '>', new Date().toISOString())
      .orderBy('received_at', 'asc')
      .limit(limit)

    return webhooks.map((webhook) => ({
      ...webhook,
      payload: (() => {
        try {
          return this.safeJsonParse(
            webhook.payload,
            {},
            'pending_webhook.payload',
          )
        } catch (e) {
          this.log.warn(
            { webhookId: webhook.id, error: e },
            'Malformed webhook payload - using empty object',
          )
          return {}
        }
      })(),
      received_at: new Date(webhook.received_at),
      expires_at: new Date(webhook.expires_at),
    }))
  } catch (error) {
    this.log.error({ error }, 'Error getting pending webhooks:')
    return []
  }
}

/**
 * Deletes a pending webhook entry by its ID.
 *
 * @param id - The ID of the pending webhook to delete
 * @returns True if a webhook was deleted; false otherwise
 */
export async function deletePendingWebhook(
  this: DatabaseService,
  id: number,
): Promise<boolean> {
  try {
    const deleted = await this.knex('pending_webhooks').where({ id }).delete()

    return deleted > 0
  } catch (error) {
    this.log.error({ error }, `Error deleting pending webhook ${id}:`)
    return false
  }
}

/**
 * Deletes all expired pending webhooks from the database.
 *
 * @returns The number of webhook records that were deleted.
 */
export async function cleanupExpiredWebhooks(
  this: DatabaseService,
): Promise<number> {
  try {
    const deleted = await this.knex('pending_webhooks')
      .where('expires_at', '<', new Date().toISOString())
      .delete()

    return deleted
  } catch (error) {
    this.log.error({ error }, 'Error cleaning up expired webhooks:')
    return 0
  }
}

/**
 * Retrieves non-expired pending webhooks matching the specified GUID and media type.
 *
 * Safely parses each webhook's payload and converts timestamp fields to Date objects. Returns an empty array if an error occurs.
 *
 * @param guid - The unique identifier to filter webhooks
 * @param mediaType - The media type to filter by ('movie' or 'show')
 * @returns An array of matching pending webhooks
 */
export async function getWebhooksByGuid(
  this: DatabaseService,
  guid: string,
  mediaType: 'movie' | 'show',
): Promise<PendingWebhook[]> {
  try {
    const webhooks = await this.knex('pending_webhooks')
      .where({ guid, media_type: mediaType })
      .where('expires_at', '>', new Date().toISOString())

    return webhooks.map((webhook) => ({
      ...webhook,
      payload: (() => {
        try {
          return this.safeJsonParse(
            webhook.payload,
            {},
            'pending_webhook.payload',
          )
        } catch (e) {
          this.log.warn(
            { webhookId: webhook.id, guid, error: e },
            'Malformed webhook payload - using empty object',
          )
          return {}
        }
      })(),
      received_at: new Date(webhook.received_at),
      expires_at: new Date(webhook.expires_at),
    }))
  } catch (error) {
    this.log.error({ error }, `Error getting webhooks for ${guid}:`)
    return []
  }
}
