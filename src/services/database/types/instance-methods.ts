import type { Knex } from 'knex'
import type { SonarrInstance } from '@root/types/sonarr.types.js'
import type { RadarrInstance } from '@root/types/radarr.types.js'

declare module '@services/database.service.js' {
  interface DatabaseService {
    // SONARR INSTANCE MANAGEMENT
    /**
     * Retrieves all enabled Sonarr instances
     * @returns Promise resolving to an array of all enabled Sonarr instances
     */
    getAllSonarrInstances(): Promise<SonarrInstance[]>

    /**
     * Retrieves the default Sonarr instance
     * @returns Promise resolving to the default Sonarr instance if found, null otherwise
     */
    getDefaultSonarrInstance(): Promise<SonarrInstance | null>

    /**
     * Retrieves a specific Sonarr instance by ID
     * @param id - ID of the Sonarr instance to retrieve
     * @returns Promise resolving to the Sonarr instance if found, null otherwise
     */
    getSonarrInstance(id: number): Promise<SonarrInstance | null>

    /**
     * Creates a new Sonarr instance
     * @param instance - Sonarr instance data excluding ID
     * @returns Promise resolving to the ID of the created instance
     */
    createSonarrInstance(instance: Omit<SonarrInstance, 'id'>): Promise<number>

    /**
     * Updates an existing Sonarr instance
     * @param id - ID of the Sonarr instance to update
     * @param updates - Partial Sonarr instance data to update
     * @returns Promise resolving to void when complete
     */
    updateSonarrInstance(
      id: number,
      updates: Partial<SonarrInstance>,
    ): Promise<void>

    /**
     * Cleans up references to a deleted Sonarr instance
     * @param deletedId - ID of the deleted Sonarr instance
     * @param trx - Optional Knex transaction object
     * @returns Promise resolving to void when complete
     */
    cleanupDeletedSonarrInstanceReferences(
      deletedId: number,
      trx?: Knex.Transaction,
    ): Promise<void>

    /**
     * Deletes a Sonarr instance and cleans up references to it
     * @param id - ID of the Sonarr instance to delete
     * @returns Promise resolving to void when complete
     */
    deleteSonarrInstance(id: number): Promise<void>

    /**
     * Retrieves a Sonarr instance by transformed base URL identifier
     * Used for webhook routing where instanceId comes from URL transformation
     * @param instanceId - Transformed base URL identifier (string)
     * @returns Promise resolving to the Sonarr instance if found, null otherwise
     */
    getSonarrInstanceByIdentifier(
      instanceId: string,
    ): Promise<SonarrInstance | null>

    // RADARR INSTANCE MANAGEMENT
    /**
     * Retrieves all enabled Radarr instances
     * @returns Promise resolving to an array of all enabled Radarr instances
     */
    getAllRadarrInstances(): Promise<RadarrInstance[]>

    /**
     * Retrieves the default Radarr instance
     * @returns Promise resolving to the default Radarr instance if found, null otherwise
     */
    getDefaultRadarrInstance(): Promise<RadarrInstance | null>

    /**
     * Retrieves a specific Radarr instance by ID
     * @param id - ID of the Radarr instance to retrieve
     * @returns Promise resolving to the Radarr instance if found, null otherwise
     */
    getRadarrInstance(id: number): Promise<RadarrInstance | null>

    /**
     * Creates a new Radarr instance
     * @param instance - Radarr instance data excluding ID
     * @returns Promise resolving to the ID of the created instance
     */
    createRadarrInstance(instance: Omit<RadarrInstance, 'id'>): Promise<number>

    /**
     * Updates an existing Radarr instance
     * @param id - ID of the Radarr instance to update
     * @param updates - Partial Radarr instance data to update
     * @returns Promise resolving to void when complete
     */
    updateRadarrInstance(
      id: number,
      updates: Partial<RadarrInstance>,
    ): Promise<void>

    /**
     * Cleans up references to a deleted Radarr instance
     * @param deletedId - ID of the deleted Radarr instance
     * @param trx - Optional Knex transaction object
     * @returns Promise resolving to void when complete
     */
    cleanupDeletedRadarrInstanceReferences(
      deletedId: number,
      trx?: Knex.Transaction,
    ): Promise<void>

    /**
     * Deletes a Radarr instance and cleans up references to it
     * @param id - ID of the Radarr instance to delete
     * @returns Promise resolving to void when complete
     */
    deleteRadarrInstance(id: number): Promise<void>

    /**
     * Retrieves a Radarr instance by transformed base URL identifier
     * Used for webhook routing where instanceId comes from URL transformation
     * @param instanceId - Transformed base URL identifier (string)
     * @returns Promise resolving to the Radarr instance if found, null otherwise
     */
    getRadarrInstanceByIdentifier(
      instanceId: string,
    ): Promise<RadarrInstance | null>
  }
}
