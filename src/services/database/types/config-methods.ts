import type { Config } from '@root/types/config.types.js'

declare module '@services/database.service.js' {
  interface DatabaseService {
    // CONFIGURATION MANAGEMENT
    /**
     * Retrieves application configuration
     * @returns Promise resolving to the configuration if found, undefined otherwise
     */
    getConfig(): Promise<Config | undefined>

    /**
     * Creates a new configuration entry in the database
     * @param config - Configuration data excluding timestamps
     * @returns Promise resolving to the ID of the created configuration
     */
    createConfig(
      config: Omit<Config, 'created_at' | 'updated_at'>,
    ): Promise<number>

    /**
     * Updates an existing configuration entry
     * @param id - ID of the configuration to update
     * @param config - Partial configuration data to update
     * @returns Promise resolving to true if the configuration was updated, false otherwise
     */
    updateConfig(id: number, config: Partial<Config>): Promise<boolean>
  }
}
