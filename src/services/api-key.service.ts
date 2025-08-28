import type { ApiKey, ApiKeyCreate } from '@root/types/api-key.types.js'
import type { Auth } from '@schemas/auth/auth.js'
import type { FastifyInstance } from 'fastify'

/**
 * Service for managing API keys
 */
export class ApiKeyService {
  private apiKeyCache: Map<string, Auth> = new Map() // key -> user session data

  constructor(private fastify: FastifyInstance) {}

  /**
   * Initialize the service and load API keys into cache
   */
  async initialize(): Promise<void> {
    await this.refreshCache()
  }

  /**
   * Refresh the API key cache from database
   */
  async refreshCache(): Promise<void> {
    try {
      const apiKeys = await this.fastify.db.getActiveApiKeys()
      const nextCache = new Map<string, Auth>()

      for (const apiKey of apiKeys) {
        nextCache.set(apiKey.key, apiKey.user)
      }

      // Atomic swap to avoid race conditions during refresh
      this.apiKeyCache = nextCache
      this.fastify.log.info(
        { count: nextCache.size },
        'Loaded API keys into cache',
      )
    } catch (error) {
      this.fastify.log.error({ error }, 'Failed to refresh API key cache')
      throw error
    }
  }

  /**
   * Create a new API key
   */
  async createApiKey(data: ApiKeyCreate): Promise<ApiKey> {
    try {
      const apiKey = await this.fastify.db.createApiKey(data)
      await this.refreshCache() // Refresh cache after creation
      this.fastify.log.info(
        { apiKeyId: apiKey.id, name: apiKey.name },
        'Created new API key',
      )
      return apiKey
    } catch (error) {
      this.fastify.log.error({ error, data }, 'Failed to create API key')
      throw error
    }
  }

  /**
   * Get all API keys
   */
  async getApiKeys(): Promise<ApiKey[]> {
    try {
      return await this.fastify.db.getApiKeys()
    } catch (error) {
      this.fastify.log.error({ error }, 'Failed to get API keys')
      throw error
    }
  }

  /**
   * Revoke an API key
   */
  async revokeApiKey(id: number): Promise<boolean> {
    try {
      const result = await this.fastify.db.revokeApiKey(id)
      if (result) {
        await this.refreshCache() // Refresh cache after revocation
        this.fastify.log.info({ apiKeyId: id }, 'Revoked API key')
      } else {
        this.fastify.log.warn(
          { apiKeyId: id },
          'API key not found for revocation',
        )
      }
      return result
    } catch (error) {
      this.fastify.log.error(
        { error, apiKeyId: id },
        'Failed to revoke API key',
      )
      throw error
    }
  }

  /**
   * Verify an API key and return user data if valid
   */
  verifyAndGetUser(key: string): Auth | null {
    const user = this.apiKeyCache.get(key) ?? null
    if (!user) {
      this.fastify.log.warn('Invalid API key attempted')
    }
    return user
  }
}
