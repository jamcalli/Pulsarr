import type {
  WatchlistInstanceStatus,
  WatchlistStatus,
} from '@root/types/watchlist-status.types.js'
import type { Knex } from 'knex'

declare module '@services/database.service.js' {
  interface DatabaseService {
    // RADARR JUNCTION TABLE METHODS
    /**
     * Gets Radarr instance IDs for a watchlist item
     * @param watchlistId - ID of the watchlist item
     * @returns Promise resolving to array of Radarr instance IDs
     */
    getWatchlistRadarrInstanceIds(
      watchlistId: number,
      trx?: Knex.Transaction,
    ): Promise<number[]>

    /**
     * Gets status of a watchlist item in a specific Radarr instance
     * @param watchlistId - ID of the watchlist item
     * @param instanceId - ID of the Radarr instance
     * @returns Promise resolving to the status information if found, null otherwise
     */
    getWatchlistRadarrInstanceStatus(
      watchlistId: number,
      instanceId: number,
    ): Promise<WatchlistInstanceStatus | null>

    /**
     * Adds a watchlist item to a Radarr instance
     * @param watchlistId - ID of the watchlist item
     * @param instanceId - ID of the Radarr instance
     * @param status - Optional initial status
     * @param isPrimary - Whether this instance is primary for the item
     * @param syncing - Whether the item is currently syncing
     * @returns Promise resolving to void when complete
     */
    addWatchlistToRadarrInstance(
      watchlistId: number,
      instanceId: number,
      status?: WatchlistStatus,
      isPrimary?: boolean,
      syncing?: boolean,
      trx?: Knex.Transaction,
    ): Promise<void>

    /**
     * Updates the status of a watchlist item in a Radarr instance
     * @param watchlistId - ID of the watchlist item
     * @param instanceId - ID of the Radarr instance
     * @param status - New status to set
     * @param lastNotifiedAt - Optional timestamp when item was last notified
     * @returns Promise resolving to void when complete
     */
    updateWatchlistRadarrInstanceStatus(
      watchlistId: number,
      instanceId: number,
      status: WatchlistStatus,
      lastNotifiedAt?: string | null,
    ): Promise<void>

    /**
     * Removes a watchlist item from a Radarr instance
     * @param watchlistId - ID of the watchlist item
     * @param instanceId - ID of the Radarr instance
     * @returns Promise resolving to void when complete
     */
    removeWatchlistFromRadarrInstance(
      watchlistId: number,
      instanceId: number,
    ): Promise<void>

    /**
     * Sets the primary Radarr instance for a watchlist item
     * @param watchlistId - ID of the watchlist item
     * @param instanceId - ID of the Radarr instance to set as primary
     * @returns Promise resolving to void when complete
     */
    setPrimaryRadarrInstance(
      watchlistId: number,
      instanceId: number,
      trx?: Knex.Transaction,
    ): Promise<void>

    /**
     * Gets all Radarr instance junctions for given watchlist items
     * @param watchlistIds - Array of watchlist item IDs
     * @returns Promise resolving to array of junction records
     */
    getAllWatchlistRadarrInstanceJunctions(watchlistIds: number[]): Promise<
      Array<{
        watchlist_id: number
        radarr_instance_id: number
        status: WatchlistStatus
        is_primary: boolean
        syncing: boolean
        last_notified_at: string | null
      }>
    >

    /**
     * Bulk adds watchlist items to Radarr instances
     * @param junctions - Array of items to add with watchlist ID, instance ID, and optional status
     * @returns Promise resolving to void when complete
     */
    bulkAddWatchlistToRadarrInstances(
      junctions: Array<{
        watchlist_id: number
        radarr_instance_id: number
        status: WatchlistStatus
        is_primary: boolean
        last_notified_at?: string
        syncing?: boolean
      }>,
    ): Promise<void>

    /**
     * Bulk updates watchlist item statuses in Radarr instances
     * @param updates - Array of status updates
     * @returns Promise resolving to void when complete
     */
    bulkUpdateWatchlistRadarrInstanceStatuses(
      updates: Array<{
        watchlist_id: number
        radarr_instance_id: number
        status?: WatchlistStatus
        is_primary?: boolean
        last_notified_at?: string
      }>,
    ): Promise<void>

    /**
     * Bulk removes watchlist items from Radarr instances
     * @param items - Array of items to remove with watchlist ID and instance ID
     * @returns Promise resolving to void when complete
     */
    bulkRemoveWatchlistFromRadarrInstances(
      removals: Array<{ watchlist_id: number; radarr_instance_id: number }>,
    ): Promise<void>

    // SONARR JUNCTION TABLE METHODS
    /**
     * Gets Sonarr instance IDs for a watchlist item
     * @param watchlistId - ID of the watchlist item
     * @returns Promise resolving to array of Sonarr instance IDs
     */
    getWatchlistSonarrInstanceIds(
      watchlistId: number,
      trx?: Knex.Transaction,
    ): Promise<number[]>

    /**
     * Gets status of a watchlist item in a specific Sonarr instance
     * @param watchlistId - ID of the watchlist item
     * @param instanceId - ID of the Sonarr instance
     * @returns Promise resolving to the status information if found, null otherwise
     */
    getWatchlistSonarrInstanceStatus(
      watchlistId: number,
      instanceId: number,
    ): Promise<WatchlistInstanceStatus | null>

    /**
     * Adds a watchlist item to a Sonarr instance
     * @param watchlistId - ID of the watchlist item
     * @param instanceId - ID of the Sonarr instance
     * @param status - Optional initial status
     * @param isPrimary - Whether this instance is primary for the item
     * @param syncing - Whether the item is currently syncing
     * @returns Promise resolving to void when complete
     */
    addWatchlistToSonarrInstance(
      watchlistId: number,
      instanceId: number,
      status?: WatchlistStatus,
      isPrimary?: boolean,
      syncing?: boolean,
      trx?: Knex.Transaction,
    ): Promise<void>

    /**
     * Updates the status of a watchlist item in a Sonarr instance
     * @param watchlistId - ID of the watchlist item
     * @param instanceId - ID of the Sonarr instance
     * @param status - New status to set
     * @param lastNotifiedAt - Optional timestamp when item was last notified
     * @returns Promise resolving to void when complete
     */
    updateWatchlistSonarrInstanceStatus(
      watchlistId: number,
      instanceId: number,
      status: WatchlistStatus,
      lastNotifiedAt?: string | null,
    ): Promise<void>

    /**
     * Removes a watchlist item from a Sonarr instance
     * @param watchlistId - ID of the watchlist item
     * @param instanceId - ID of the Sonarr instance
     * @returns Promise resolving to void when complete
     */
    removeWatchlistFromSonarrInstance(
      watchlistId: number,
      instanceId: number,
    ): Promise<void>

    /**
     * Sets the primary Sonarr instance for a watchlist item
     * @param watchlistId - ID of the watchlist item
     * @param instanceId - ID of the Sonarr instance to set as primary
     * @returns Promise resolving to void when complete
     */
    setPrimarySonarrInstance(
      watchlistId: number,
      instanceId: number,
      trx?: Knex.Transaction,
    ): Promise<void>

    /**
     * Gets all Sonarr instance junctions for given watchlist items
     * @param watchlistIds - Array of watchlist item IDs
     * @returns Promise resolving to array of junction records
     */
    getAllWatchlistSonarrInstanceJunctions(watchlistIds: number[]): Promise<
      Array<{
        watchlist_id: number
        sonarr_instance_id: number
        status: WatchlistStatus
        is_primary: boolean
        last_notified_at: string | null
      }>
    >

    /**
     * Bulk adds watchlist items to Sonarr instances
     * @param junctions - Array of items to add with watchlist ID, instance ID, and optional status
     * @returns Promise resolving to void when complete
     */
    bulkAddWatchlistToSonarrInstances(
      junctions: Array<{
        watchlist_id: number
        sonarr_instance_id: number
        status: WatchlistStatus
        is_primary: boolean
        last_notified_at?: string
        syncing?: boolean
      }>,
    ): Promise<void>

    /**
     * Bulk updates watchlist item statuses in Sonarr instances
     * @param updates - Array of status updates
     * @returns Promise resolving to void when complete
     */
    bulkUpdateWatchlistSonarrInstanceStatuses(
      updates: Array<{
        watchlist_id: number
        sonarr_instance_id: number
        status?: WatchlistStatus
        is_primary?: boolean
        last_notified_at?: string
      }>,
    ): Promise<void>

    /**
     * Bulk removes watchlist items from Sonarr instances
     * @param items - Array of items to remove with watchlist ID and instance ID
     * @returns Promise resolving to void when complete
     */
    bulkRemoveWatchlistFromSonarrInstances(
      removals: Array<{ watchlist_id: number; sonarr_instance_id: number }>,
    ): Promise<void>

    /**
     * Gets content breakdown by instance
     * @returns Promise resolving to object with Sonarr and Radarr instance content counts
     */
    getInstanceContentBreakdown(): Promise<{
      success: boolean
      instances: Array<{
        id: number
        name: string
        type: 'sonarr' | 'radarr'
        total_items: number
        by_status: Array<{ status: string; count: number }>
        by_content_type: Array<{ content_type: string; count: number }>
        primary_items: number
      }>
    }>

    /**
     * Updates the syncing status for a Radarr item
     * @param watchlistId - ID of the watchlist item
     * @param instanceId - ID of the Radarr instance
     * @param syncing - Whether the item is currently syncing
     * @returns Promise resolving to void when complete
     */
    updateRadarrSyncingStatus(
      watchlistId: number,
      instanceId: number,
      syncing: boolean,
      trx?: Knex.Transaction,
    ): Promise<void>

    /**
     * Updates the syncing status for a Sonarr item
     * @param watchlistId - ID of the watchlist item
     * @param instanceId - ID of the Sonarr instance
     * @param syncing - Whether the item is currently syncing
     * @returns Promise resolving to void when complete
     */
    updateSonarrSyncingStatus(
      watchlistId: number,
      instanceId: number,
      syncing: boolean,
      trx?: Knex.Transaction,
    ): Promise<void>

    /**
     * Checks if a Radarr item is currently syncing
     * @param watchlistId - ID of the watchlist item
     * @param instanceId - ID of the Radarr instance
     * @returns Promise resolving to true if syncing, false otherwise
     */
    isRadarrItemSyncing(
      watchlistId: number,
      instanceId: number,
    ): Promise<boolean>

    /**
     * Checks if a Sonarr item is currently syncing
     * @param watchlistId - ID of the watchlist item
     * @param instanceId - ID of the Sonarr instance
     * @returns Promise resolving to true if syncing, false otherwise
     */
    isSonarrItemSyncing(
      watchlistId: number,
      instanceId: number,
    ): Promise<boolean>
  }
}
