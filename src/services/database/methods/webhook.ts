import type {
  PendingWebhook,
  PendingWebhookCreate,
} from '@root/types/pending-webhooks.types.js'
import type { DatabaseService } from '@services/database.service.js'
import { parseJsonOr } from '@utils/json.js'

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

/** Non-expired rows only, and returns an empty array on error. */
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
          return parseJsonOr(
            webhook.payload,
            {},
            this.log,
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

/** Returns false on error. */
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

/** Returns 0 on error. */
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
