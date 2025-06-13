declare module '../../database.service.js' {
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
    updateSonarrInstance(id: number, updates: Partial<SonarrInstance>): Promise<void>

    /**
     * Cleans up references to a deleted Sonarr instance
     * @param deletedId - ID of the deleted Sonarr instance
     * @param trx - Optional Knex transaction object
     * @returns Promise resolving to void when complete
     */
    cleanupDeletedSonarrInstanceReferences(deletedId: number, trx?: Knex.Transaction): Promise<void>

    /**
     * Deletes a Sonarr instance and cleans up references to it
     * @param id - ID of the Sonarr instance to delete
     * @returns Promise resolving to void when complete
     */
    deleteSonarrInstance(id: number): Promise<void>

    /**
     * Retrieves a Sonarr instance by ID or name
     * @param identifier - Instance ID (number) or name (string)
     * @returns Promise resolving to the Sonarr instance if found, null otherwise
     */
    getSonarrInstanceByIdentifier(identifier: string | number): Promise<SonarrInstance | null>

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
    updateRadarrInstance(id: number, updates: Partial<RadarrInstance>): Promise<void>

    /**
     * Cleans up references to a deleted Radarr instance
     * @param deletedId - ID of the deleted Radarr instance
     * @param trx - Optional Knex transaction object
     * @returns Promise resolving to void when complete
     */
    cleanupDeletedRadarrInstanceReferences(deletedId: number, trx?: Knex.Transaction): Promise<void>

    /**
     * Deletes a Radarr instance and cleans up references to it
     * @param id - ID of the Radarr instance to delete
     * @returns Promise resolving to void when complete
     */
    deleteRadarrInstance(id: number): Promise<void>

    /**
     * Retrieves a Radarr instance by ID or name
     * @param identifier - Instance ID (number) or name (string)
     * @returns Promise resolving to the Radarr instance if found, null otherwise
     */
    getRadarrInstanceByIdentifier(identifier: string | number): Promise<RadarrInstance | null>

    // RADARR JUNCTION TABLE METHODS
    /**
     * Gets Radarr instance IDs for a watchlist item
     * @param watchlistId - ID of the watchlist item
     * @returns Promise resolving to array of Radarr instance IDs
     */
    getWatchlistRadarrInstanceIds(watchlistId: number): Promise<number[]>

    /**
     * Gets status of a watchlist item in a specific Radarr instance
     * @param watchlistId - ID of the watchlist item
     * @param instanceId - ID of the Radarr instance
     * @returns Promise resolving to the status information if found, null otherwise
     */
    getWatchlistRadarrInstanceStatus(watchlistId: number, instanceId: number): Promise<WatchlistInstanceStatus | null>

    /**
     * Adds a watchlist item to a Radarr instance
     * @param watchlistId - ID of the watchlist item
     * @param instanceId - ID of the Radarr instance
     * @param status - Optional initial status
     * @returns Promise resolving to void when complete
     */
    addWatchlistToRadarrInstance(watchlistId: number, instanceId: number, status?: 'pending' | 'requested' | 'grabbed' | 'notified'): Promise<void>

    /**
     * Updates the status of a watchlist item in a Radarr instance
     * @param watchlistId - ID of the watchlist item
     * @param instanceId - ID of the Radarr instance
     * @param status - New status to set
     * @param added - Optional timestamp when item was added
     * @returns Promise resolving to void when complete
     */
    updateWatchlistRadarrInstanceStatus(watchlistId: number, instanceId: number, status: 'pending' | 'requested' | 'grabbed' | 'notified', added?: string): Promise<void>

    /**
     * Removes a watchlist item from a Radarr instance
     * @param watchlistId - ID of the watchlist item
     * @param instanceId - ID of the Radarr instance
     * @returns Promise resolving to void when complete
     */
    removeWatchlistFromRadarrInstance(watchlistId: number, instanceId: number): Promise<void>

    /**
     * Sets the primary Radarr instance for a watchlist item
     * @param watchlistId - ID of the watchlist item
     * @param instanceId - ID of the Radarr instance to set as primary
     * @returns Promise resolving to void when complete
     */
    setPrimaryRadarrInstance(watchlistId: number, instanceId: number): Promise<void>

    /**
     * Gets all Radarr instance junctions for given watchlist items
     * @param watchlistIds - Array of watchlist item IDs
     * @returns Promise resolving to array of junction records
     */
    getAllWatchlistRadarrInstanceJunctions(watchlistIds: number[]): Promise<Array<{ watchlist_id: number, radarr_instance_id: number, status: string, is_primary: boolean, added: string | null }>>

    /**
     * Bulk adds watchlist items to Radarr instances
     * @param items - Array of items to add with watchlist ID, instance ID, and optional status
     * @returns Promise resolving to void when complete
     */
    bulkAddWatchlistToRadarrInstances(items: Array<{ watchlistId: number, instanceId: number, status?: string }>): Promise<void>

    /**
     * Bulk updates watchlist item statuses in Radarr instances
     * @param updates - Array of status updates
     * @returns Promise resolving to void when complete
     */
    bulkUpdateWatchlistRadarrInstanceStatuses(updates: Array<{ watchlistId: number, instanceId: number, status: string, added?: string }>): Promise<void>

    /**
     * Bulk removes watchlist items from Radarr instances
     * @param items - Array of items to remove with watchlist ID and instance ID
     * @returns Promise resolving to void when complete
     */
    bulkRemoveWatchlistFromRadarrInstances(items: Array<{ watchlistId: number, instanceId: number }>): Promise<void>

    // SONARR JUNCTION TABLE METHODS
    /**
     * Gets Sonarr instance IDs for a watchlist item
     * @param watchlistId - ID of the watchlist item
     * @returns Promise resolving to array of Sonarr instance IDs
     */
    getWatchlistSonarrInstanceIds(watchlistId: number): Promise<number[]>

    /**
     * Gets status of a watchlist item in a specific Sonarr instance
     * @param watchlistId - ID of the watchlist item
     * @param instanceId - ID of the Sonarr instance
     * @returns Promise resolving to the status information if found, null otherwise
     */
    getWatchlistSonarrInstanceStatus(watchlistId: number, instanceId: number): Promise<WatchlistInstanceStatus | null>

    /**
     * Adds a watchlist item to a Sonarr instance
     * @param watchlistId - ID of the watchlist item
     * @param instanceId - ID of the Sonarr instance
     * @param status - Optional initial status
     * @returns Promise resolving to void when complete
     */
    addWatchlistToSonarrInstance(watchlistId: number, instanceId: number, status?: 'pending' | 'requested' | 'grabbed' | 'notified'): Promise<void>

    /**
     * Updates the status of a watchlist item in a Sonarr instance
     * @param watchlistId - ID of the watchlist item
     * @param instanceId - ID of the Sonarr instance
     * @param status - New status to set
     * @param added - Optional timestamp when item was added
     * @returns Promise resolving to void when complete
     */
    updateWatchlistSonarrInstanceStatus(watchlistId: number, instanceId: number, status: 'pending' | 'requested' | 'grabbed' | 'notified', added?: string): Promise<void>

    /**
     * Removes a watchlist item from a Sonarr instance
     * @param watchlistId - ID of the watchlist item
     * @param instanceId - ID of the Sonarr instance
     * @returns Promise resolving to void when complete
     */
    removeWatchlistFromSonarrInstance(watchlistId: number, instanceId: number): Promise<void>

    /**
     * Sets the primary Sonarr instance for a watchlist item
     * @param watchlistId - ID of the watchlist item
     * @param instanceId - ID of the Sonarr instance to set as primary
     * @returns Promise resolving to void when complete
     */
    setPrimarySonarrInstance(watchlistId: number, instanceId: number): Promise<void>

    /**
     * Gets all Sonarr instance junctions for given watchlist items
     * @param watchlistIds - Array of watchlist item IDs
     * @returns Promise resolving to array of junction records
     */
    getAllWatchlistSonarrInstanceJunctions(watchlistIds: number[]): Promise<Array<{ watchlist_id: number, sonarr_instance_id: number, status: string, is_primary: boolean, added: string | null }>>

    /**
     * Bulk adds watchlist items to Sonarr instances
     * @param items - Array of items to add with watchlist ID, instance ID, and optional status
     * @returns Promise resolving to void when complete
     */
    bulkAddWatchlistToSonarrInstances(items: Array<{ watchlistId: number, instanceId: number, status?: string }>): Promise<void>

    /**
     * Bulk updates watchlist item statuses in Sonarr instances
     * @param updates - Array of status updates
     * @returns Promise resolving to void when complete
     */
    bulkUpdateWatchlistSonarrInstanceStatuses(updates: Array<{ watchlistId: number, instanceId: number, status: string, added?: string }>): Promise<void>

    /**
     * Bulk removes watchlist items from Sonarr instances
     * @param items - Array of items to remove with watchlist ID and instance ID
     * @returns Promise resolving to void when complete
     */
    bulkRemoveWatchlistFromSonarrInstances(items: Array<{ watchlistId: number, instanceId: number }>): Promise<void>

    /**
     * Gets content breakdown by instance
     * @returns Promise resolving to object with Sonarr and Radarr instance content counts
     */
    getInstanceContentBreakdown(): Promise<{ sonarr: Array<{ instance_id: number, name: string, show_count: number }>, radarr: Array<{ instance_id: number, name: string, movie_count: number }> }>

    /**
     * Updates the syncing status for a Radarr item
     * @param itemId - ID of the watchlist item
     * @param instanceId - ID of the Radarr instance
     * @param isSyncing - Whether the item is currently syncing
     * @returns Promise resolving to void when complete
     */
    updateRadarrSyncingStatus(itemId: number, instanceId: number, isSyncing: boolean): Promise<void>

    /**
     * Updates the syncing status for a Sonarr item
     * @param itemId - ID of the watchlist item
     * @param instanceId - ID of the Sonarr instance
     * @param isSyncing - Whether the item is currently syncing
     * @returns Promise resolving to void when complete
     */
    updateSonarrSyncingStatus(itemId: number, instanceId: number, isSyncing: boolean): Promise<void>

    /**
     * Checks if a Radarr item is currently syncing
     * @param itemId - ID of the watchlist item
     * @param instanceId - ID of the Radarr instance
     * @returns Promise resolving to true if syncing, false otherwise
     */
    isRadarrItemSyncing(itemId: number, instanceId: number): Promise<boolean>

    /**
     * Checks if a Sonarr item is currently syncing
     * @param itemId - ID of the watchlist item
     * @param instanceId - ID of the Sonarr instance
     * @returns Promise resolving to true if syncing, false otherwise
     */
    isSonarrItemSyncing(itemId: number, instanceId: number): Promise<boolean>
  }
}