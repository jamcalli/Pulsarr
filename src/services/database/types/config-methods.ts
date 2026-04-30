import type {
  ConfigFull,
  ConfigUpdate,
} from '@root/schemas/config/config.schema.js'

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
     * @param config - Configuration data excluding auto-generated fields
     * @returns Promise resolving to the ID of the created configuration
     */
    createConfig(
      config: Omit<ConfigUpdate, 'id' | 'created_at' | 'updated_at'>,
    ): Promise<number>

    /**
     * Updates the configuration entry (all fields optional)
     * @param config - Configuration data to update
     * @returns Promise resolving to true if the configuration was updated, false otherwise
     */
    updateConfig(config: ConfigUpdate): Promise<boolean>

    /**
     * Reads the last Pulsarr release version that produced an out-of-app update
     * notification. Internal field, not exposed via the public config API.
     */
    getLastNotifiedVersion(): Promise<string | null>

    /**
     * Persists the last Pulsarr release version that produced an out-of-app update
     * notification. Bypasses ALLOWED_COLUMNS - internal use by update-check plugin only.
     * Pass null to reset the baseline (used when notifyOnUpdate is freshly enabled).
     */
    setLastNotifiedVersion(version: string | null): Promise<boolean>
  }
}
