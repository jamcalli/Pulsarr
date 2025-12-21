import type {
  CreateWebhookEndpoint,
  UpdateWebhookEndpoint,
  WebhookEndpoint,
  WebhookEventType,
} from '@root/types/webhook-endpoint.types.js'
import type { DatabaseService } from '@services/database.service.js'

/**
 * Database row representation for webhook_endpoints table
 */
interface WebhookEndpointRow {
  id: number
  name: string
  url: string
  auth_header_name: string | null
  auth_header_value: string | null
  event_types: string // JSON string in database
  enabled: boolean | number
  created_at: string
  updated_at: string
}

/**
 * Converts a database row to a WebhookEndpoint object
 */
function rowToEndpoint(
  this: DatabaseService,
  row: WebhookEndpointRow,
): WebhookEndpoint {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    auth_header_name: row.auth_header_name,
    auth_header_value: row.auth_header_value,
    event_types: this.safeJsonParse<WebhookEventType[]>(
      row.event_types,
      [],
      'webhook_endpoint.event_types',
    ),
    enabled: this.toBoolean(row.enabled, true),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

/**
 * Retrieves all enabled webhook endpoints that subscribe to a specific event type.
 *
 * @param eventType - The event type to filter by
 * @returns Array of webhook endpoints subscribed to the event
 */
export async function getWebhookEndpointsForEvent(
  this: DatabaseService,
  eventType: WebhookEventType,
): Promise<WebhookEndpoint[]> {
  const rows = await this.knex<WebhookEndpointRow>('webhook_endpoints')
    .where('enabled', true)
    .select('*')

  // Parse and filter by event type (JSON array contains check)
  return rows
    .map((row) => rowToEndpoint.call(this, row))
    .filter((endpoint) => endpoint.event_types.includes(eventType))
}

/**
 * Retrieves all webhook endpoints ordered by creation date.
 *
 * @returns Array of all webhook endpoints
 */
export async function getAllWebhookEndpoints(
  this: DatabaseService,
): Promise<WebhookEndpoint[]> {
  const rows = await this.knex<WebhookEndpointRow>('webhook_endpoints')
    .select('*')
    .orderBy('created_at', 'asc')

  return rows.map((row) => rowToEndpoint.call(this, row))
}

/**
 * Retrieves a single webhook endpoint by ID.
 *
 * @param id - The endpoint ID
 * @returns The webhook endpoint or null if not found
 */
export async function getWebhookEndpointById(
  this: DatabaseService,
  id: number,
): Promise<WebhookEndpoint | null> {
  const row = await this.knex<WebhookEndpointRow>('webhook_endpoints')
    .where('id', id)
    .first()

  if (!row) {
    return null
  }

  return rowToEndpoint.call(this, row)
}

/**
 * Creates a new webhook endpoint.
 *
 * @param endpoint - The endpoint data to create
 * @returns The created webhook endpoint
 */
export async function createWebhookEndpoint(
  this: DatabaseService,
  endpoint: CreateWebhookEndpoint,
): Promise<WebhookEndpoint> {
  const now = this.timestamp

  const [row] = await this.knex<WebhookEndpointRow>('webhook_endpoints')
    .insert({
      name: endpoint.name,
      url: endpoint.url,
      auth_header_name: endpoint.authHeaderName ?? null,
      auth_header_value: endpoint.authHeaderValue ?? null,
      event_types: JSON.stringify(endpoint.eventTypes),
      enabled: endpoint.enabled ?? true,
      created_at: now,
      updated_at: now,
    })
    .returning('*')

  return rowToEndpoint.call(this, row)
}

/**
 * Updates an existing webhook endpoint.
 *
 * @param id - The endpoint ID to update
 * @param updates - The fields to update
 * @returns The updated webhook endpoint or null if not found
 */
export async function updateWebhookEndpoint(
  this: DatabaseService,
  id: number,
  updates: UpdateWebhookEndpoint,
): Promise<WebhookEndpoint | null> {
  const updateData: Record<string, unknown> = {
    updated_at: this.timestamp,
  }

  if (updates.name !== undefined) {
    updateData.name = updates.name
  }
  if (updates.url !== undefined) {
    updateData.url = updates.url
  }
  if (updates.authHeaderName !== undefined) {
    updateData.auth_header_name = updates.authHeaderName
  }
  if (updates.authHeaderValue !== undefined) {
    updateData.auth_header_value = updates.authHeaderValue
  }
  if (updates.eventTypes !== undefined) {
    updateData.event_types = JSON.stringify(updates.eventTypes)
  }
  if (updates.enabled !== undefined) {
    updateData.enabled = updates.enabled
  }

  const [row] = await this.knex<WebhookEndpointRow>('webhook_endpoints')
    .where('id', id)
    .update(updateData)
    .returning('*')

  if (!row) {
    return null
  }

  return rowToEndpoint.call(this, row)
}

/**
 * Deletes a webhook endpoint by ID.
 *
 * @param id - The endpoint ID to delete
 * @returns True if the endpoint was deleted, false if not found
 */
export async function deleteWebhookEndpoint(
  this: DatabaseService,
  id: number,
): Promise<boolean> {
  const deleted = await this.knex('webhook_endpoints').where('id', id).delete()

  return deleted > 0
}
