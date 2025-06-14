import type { DatabaseService } from '@services/database.service.js'
import type {
  PendingWebhook,
  PendingWebhookCreate,
} from '@root/types/pending-webhooks.types.js'

/**
 * Creates a new pending webhook entry
 *
 * @param webhook - The webhook data to create
 * @returns Promise resolving to the created webhook with its ID
 */
export async function createPendingWebhook(
  this: DatabaseService,
  webhook: PendingWebhookCreate,
): Promise<PendingWebhook> {
  try {
    const result = await this.knex('pending_webhooks')
      .insert({
        ...webhook,
        received_at: this.timestamp,
        expires_at: webhook.expires_at.toISOString(),
        payload: JSON.stringify(webhook.payload),
      })
      .returning('id')

    const id = this.extractId(result)

    return {
      id,
      ...webhook,
      received_at: new Date(this.timestamp),
      expires_at: webhook.expires_at,
    }
  } catch (error) {
    this.log.error('Error creating pending webhook:', error)
    throw new Error('Failed to create pending webhook')
  }
}

/**
 * Gets all pending webhooks that haven't expired
 *
 * @param limit - Optional limit of results (default: 50)
 * @returns Promise resolving to array of pending webhooks
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
    this.log.error('Error getting pending webhooks:', error)
    return []
  }
}

/**
 * Deletes a processed webhook
 *
 * @param id - The webhook ID to delete
 * @returns Promise resolving to boolean indicating success
 */
export async function deletePendingWebhook(
  this: DatabaseService,
  id: number,
): Promise<boolean> {
  try {
    const deleted = await this.knex('pending_webhooks').where({ id }).delete()

    return deleted > 0
  } catch (error) {
    this.log.error(`Error deleting pending webhook ${id}:`, error)
    return false
  }
}

/**
 * Cleans up expired webhooks
 *
 * @returns Promise resolving to number of deleted webhooks
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
    this.log.error('Error cleaning up expired webhooks:', error)
    return 0
  }
}

/**
 * Gets webhooks by GUID and media type
 *
 * @param guid - The GUID to search for
 * @param mediaType - The media type (movie or show)
 * @returns Promise resolving to array of pending webhooks
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
    this.log.error(`Error getting webhooks for ${guid}:`, error)
    return []
  }
}
