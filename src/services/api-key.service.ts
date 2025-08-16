import type { ApiKey, ApiKeyCreate } from '@root/types/api-key.types.js'
import type { FastifyInstance } from 'fastify'

/**
 * Service for managing API keys
 */
export class ApiKeyService {
  private apiKeyCache: Set<string>

  constructor(private fastify: FastifyInstance) {
    this.apiKeyCache = new Set<string>()
  }

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
      const keys = await this.fastify.db.getActiveApiKeys()
      this.apiKeyCache.clear()
      for (const key of keys) {
        this.apiKeyCache.add(key)
      }
      this.fastify.log.info(`Loaded ${keys.length} API keys into cache`)
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
   * Validate an API key
   */
  async validateApiKey(key: string): Promise<boolean> {
    const isValid = this.apiKeyCache.has(key)
    if (!isValid) {
      this.fastify.log.warn('Invalid API key attempted')
    }
    return isValid
  }
}
