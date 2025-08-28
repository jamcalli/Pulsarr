import type { ApiKey, ApiKeyCreate } from '@root/types/api-key.types.js'
import type { Auth } from '@schemas/auth/auth.js'

declare module '@services/database.service.js' {
  interface DatabaseService {
    // API KEY MANAGEMENT
    /**
     * Creates a new API key
     * @param data - API key creation data (name)
     * @returns Promise resolving to the created API key with the actual key value
     */
    createApiKey(data: ApiKeyCreate): Promise<ApiKey>

    /**
     * Retrieves all active API keys
     * @returns Promise resolving to array of API keys
     */
    getApiKeys(): Promise<ApiKey[]>

    /**
     * Revokes an API key by setting it as inactive
     * @param id - The ID of the API key to revoke
     * @returns Promise resolving to true if revoked, false if not found
     */
    revokeApiKey(id: number): Promise<boolean>

    /**
     * Retrieves all active API keys for cache loading
     * @returns Promise resolving to array of key objects with full user session data
     */
    getActiveApiKeys(): Promise<Array<{ key: string; user: Auth }>>
  }
}
