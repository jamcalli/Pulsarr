import { randomBytes } from 'node:crypto'
import type { DatabaseService } from '@services/database.service.js'
import type {
  ApiKey,
  ApiKeyCreate,
  ApiKeyResponse,
} from '@root/types/api-key.types.js'

function generateApiKey(): string {
  // Generate a secure random key
  return randomBytes(32).toString('base64url')
}

export async function createApiKey(
  this: DatabaseService,
  data: ApiKeyCreate,
): Promise<ApiKeyResponse> {
  const key = generateApiKey()

  const [apiKey] = await this.knex('api_keys')
    .insert({
      name: data.name,
      key: key,
      is_active: true,
      created_at: this.timestamp,
    })
    .returning('*')

  // Refresh the in-memory cache
  await this.fastify.apiKeys.refreshCache()

  return {
    id: apiKey.id,
    name: apiKey.name,
    key: apiKey.key,
    created_at: apiKey.created_at,
  }
}

export async function getApiKeys(
  this: DatabaseService,
): Promise<ApiKeyResponse[]> {
  const keys = await this.knex('api_keys')
    .select('*')
    .where('is_active', true)
    .orderBy('created_at', 'desc')

  return keys.map((key: ApiKey) => ({
    id: key.id,
    name: key.name,
    key: key.key,
    created_at: key.created_at,
  }))
}

export async function validateApiKey(
  this: DatabaseService,
  key: string,
): Promise<ApiKey | null> {
  // Simple lookup by key
  const apiKey = await this.knex('api_keys')
    .where('key', key)
    .where('is_active', true)
    .first()

  return apiKey || null
}

export async function revokeApiKey(
  this: DatabaseService,
  id: number,
): Promise<boolean> {
  const result = await this.knex('api_keys')
    .where('id', id)
    .update({ is_active: false })

  if (result > 0) {
    // Refresh the in-memory cache
    await this.fastify.apiKeys.refreshCache()
  }

  return result > 0
}

export async function getActiveApiKeys(
  this: DatabaseService,
): Promise<string[]> {
  const keys = await this.knex('api_keys')
    .select('key')
    .where('is_active', true)

  return keys.map((k: { key: string }) => k.key)
}
