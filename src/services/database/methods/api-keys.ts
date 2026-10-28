import { randomBytes } from 'node:crypto'
import type { ApiKey, ApiKeyCreate } from '@root/types/api-key.types.js'
import type { Auth } from '@schemas/auth/auth.js'
import type { DatabaseService } from '@services/database.service.js'
import { isUniqueViolation } from '@utils/db-errors.js'

function generateApiKey(): string {
  return randomBytes(32).toString('base64url')
}

/** Assigns the key to the lowest-id admin, retries key collisions up to five times, and throws when no admin exists. */
export async function createApiKey(
  this: DatabaseService,
  data: ApiKeyCreate,
): Promise<ApiKey> {
  const adminUser = await this.knex('admin_users')
    .where('role', 'admin')
    .orderBy('id', 'asc')
    .first()

  if (!adminUser) {
    throw new Error(
      'Cannot create API key: No admin user found. ' +
        'Please create an admin user first.',
    )
  }

  const targetUserId = adminUser.id

  const MAX_RETRIES = 5
  let attempt = 0

  while (attempt < MAX_RETRIES) {
    const key = generateApiKey()

    try {
      const [apiKey] = await this.knex('api_keys')
        .insert({
          name: data.name,
          key: key,
          user_id: targetUserId,
          is_active: true,
          created_at: this.timestamp,
        })
        .returning('*')

      return {
        id: apiKey.id,
        name: apiKey.name,
        key: apiKey.key,
        user_id: apiKey.user_id,
        created_at: apiKey.created_at,
        is_active: Boolean(apiKey.is_active),
      }
    } catch (error) {
      // key is the table's only unique constraint, so this is a key collision
      if (isUniqueViolation(error)) {
        attempt++
        if (attempt >= MAX_RETRIES) {
          throw new Error(
            'Failed to generate unique API key after multiple attempts',
          )
        }
        continue
      }
      throw error
    }
  }

  throw new Error('Failed to create API key: Maximum retry attempts exceeded')
}

/** Active keys only, newest first. */
export async function getApiKeys(this: DatabaseService): Promise<ApiKey[]> {
  const keys = await this.knex('api_keys')
    .select('id', 'name', 'key', 'user_id', 'created_at', 'is_active')
    .where('is_active', true)
    .orderBy('created_at', 'desc')

  return keys.map((key: ApiKey) => ({
    id: key.id,
    name: key.name,
    key: key.key,
    user_id: key.user_id,
    created_at: key.created_at,
    is_active: Boolean(key.is_active),
  }))
}

export async function revokeApiKey(
  this: DatabaseService,
  id: number,
): Promise<boolean> {
  const result = await this.knex('api_keys')
    .where('id', id)
    .update({ is_active: false })

  return result > 0
}

export async function getActiveApiKeys(
  this: DatabaseService,
): Promise<Array<{ key: string; user: Auth }>> {
  const keys = await this.knex('api_keys')
    .select(
      'api_keys.key',
      'admin_users.id',
      'admin_users.email',
      'admin_users.username',
      'admin_users.role',
    )
    .join('admin_users', 'api_keys.user_id', 'admin_users.id')
    .where('api_keys.is_active', true)

  return keys.map(({ key, id, email, username, role }) => ({
    key,
    user: { id, email, username, role },
  }))
}
