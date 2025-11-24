import type { ConfigFull } from '@root/schemas/config/config.schema.js'
import type { Config } from '@root/types/config.types.js'

declare module '@services/database.service.js' {
  interface DatabaseService {
    // CONFIGURATION MANAGEMENT
    /**
     * Retrieves application configuration from database with defaults applied
     * @returns Promise resolving to the database configuration if found, undefined otherwise
     */
    getConfig(): Promise<ConfigFull | undefined>

    /**
     * Creates a new configuration entry in the database
     * @param config - Configuration data excluding id and timestamps
     * @returns Promise resolving to the ID of the created configuration
     */
    createConfig(
      config: Omit<Config, 'id' | 'created_at' | 'updated_at'>,
    ): Promise<number>

    /**
     * Updates the configuration entry
     * @param config - Partial configuration data to update
     * @returns Promise resolving to true if the configuration was updated, false otherwise
     */
    updateConfig(config: Partial<Config>): Promise<boolean>
  }
}
