import type {
  CreateWebhookEndpoint,
  UpdateWebhookEndpoint,
  WebhookEndpoint,
  WebhookEventType,
} from '@root/types/webhook-endpoint.types.js'
import type { DatabaseService } from '@services/database.service.js'
import { toBoolean } from '@utils/to-boolean.js'

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
    enabled: toBoolean(row.enabled, true),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

/** Enabled endpoints only. */
export async function getWebhookEndpointsForEvent(
  this: DatabaseService,
  eventType: WebhookEventType,
): Promise<WebhookEndpoint[]> {
  const rows = await this.knex<WebhookEndpointRow>('webhook_endpoints')
    .where('enabled', true)
    .select('*')

  return rows
    .map((row) => rowToEndpoint.call(this, row))
    .filter((endpoint) => endpoint.event_types.includes(eventType))
}

export async function getAllWebhookEndpoints(
  this: DatabaseService,
): Promise<WebhookEndpoint[]> {
  const rows = await this.knex<WebhookEndpointRow>('webhook_endpoints')
    .select('*')
    .orderBy('created_at', 'asc')

  return rows.map((row) => rowToEndpoint.call(this, row))
}

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

export async function deleteWebhookEndpoint(
  this: DatabaseService,
  id: number,
): Promise<boolean> {
  const deleted = await this.knex('webhook_endpoints').where('id', id).delete()

  return deleted > 0
}
