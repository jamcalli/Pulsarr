import { randomBytes } from 'node:crypto'
import type { DatabaseService } from '@services/database.service.js'
import type {
  ApiKey,
  ApiKeyCreate,
  ApiKeyResponse,
} from '@root/types/api-key.types.js'

/**
 * Generates a secure random API key as a 32-byte base64url-encoded string.
 *
 * @returns A cryptographically secure, base64url-encoded API key string
 */
function generateApiKey(): string {
  // Generate a secure random key
  return randomBytes(32).toString('base64url')
}

/**
 * Creates a new API key record with a unique key and returns its details.
 *
 * Attempts to generate and insert a unique API key up to five times if a key collision occurs. Throws an error if a unique key cannot be generated after the maximum retries or if another database error occurs.
 *
 * @param data - The API key creation details, including the name.
 * @returns The created API key's details.
 */
export async function createApiKey(
  this: DatabaseService,
  data: ApiKeyCreate,
): Promise<ApiKeyResponse> {
  const MAX_RETRIES = 5
  let attempt = 0

  while (attempt < MAX_RETRIES) {
    const key = generateApiKey()

    try {
      const [apiKey] = await this.knex('api_keys')
        .insert({
          name: data.name,
          key: key,
          is_active: true,
          created_at: this.timestamp,
        })
        .returning('*')

      return {
        id: apiKey.id,
        name: apiKey.name,
        key: apiKey.key,
        created_at: apiKey.created_at,
        is_active: apiKey.is_active,
      }
    } catch (error) {
      // Handle unique constraint violations for both PostgreSQL and better-sqlite3
      const isUniqueViolation =
        // PostgreSQL: SQLSTATE 23505
        (error instanceof Error &&
          'code' in error &&
          error.code === '23505' &&
          'constraint' in error &&
          typeof error.constraint === 'string' &&
          error.constraint.includes('key')) ||
        // better-sqlite3: Error code SQLITE_CONSTRAINT_UNIQUE (19)
        (error instanceof Error &&
          'code' in error &&
          error.code === 'SQLITE_CONSTRAINT_UNIQUE') ||
        // better-sqlite3: Generic constraint error with UNIQUE in message
        (error instanceof Error &&
          'code' in error &&
          error.code === 'SQLITE_CONSTRAINT' &&
          error.message.includes('UNIQUE')) ||
        // Fallback: Check message for UNIQUE constraint failures
        (error instanceof Error &&
          error.message.includes('UNIQUE constraint failed'))

      if (isUniqueViolation) {
        attempt++
        if (attempt >= MAX_RETRIES) {
          throw new Error(
            'Failed to generate unique API key after multiple attempts',
          )
        }
        // Retry with a new key
        continue
      }
      // Re-throw other errors
      throw error
    }
  }

  throw new Error('Failed to create API key: Maximum retry attempts exceeded')
}

/**
 * Retrieves all active API keys from the database, ordered by creation date descending.
 *
 * @returns An array of active API key details.
 */
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
    is_active: key.is_active,
  }))
}

/**
 * Retrieves an active API key record matching the provided key string.
 *
 * @param key - The API key string to validate
 * @returns The API key object if found and active, or null if not found or inactive
 */
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

/**
 * Deactivates an API key by its ID.
 *
 * @param id - The unique identifier of the API key to revoke
 * @returns True if the API key was successfully deactivated; false if no matching key was found
 */
export async function revokeApiKey(
  this: DatabaseService,
  id: number,
): Promise<boolean> {
  const result = await this.knex('api_keys')
    .where('id', id)
    .update({ is_active: false })

  return result > 0
}

/**
 * Retrieves all active API key strings from the database.
 *
 * @returns An array of active API key strings.
 */
export async function getActiveApiKeys(
  this: DatabaseService,
): Promise<string[]> {
  const keys = await this.knex('api_keys')
    .select('key')
    .where('is_active', true)

  return keys.map((k: { key: string }) => k.key)
}
