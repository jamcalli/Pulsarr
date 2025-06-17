import type {
  WatchlistItemUpdate,
  WatchlistStatus,
} from '@root/types/watchlist-status.types.js'
import type {
  TokenWatchlistItem,
  Item as WatchlistItem,
} from '@root/types/plex.types.js'

declare module '@services/database.service.js' {
  interface DatabaseService {
    // WATCHLIST MANAGEMENT
    /**
     * Updates a watchlist item with new data
     * @param key - Unique key of the watchlist item
     * @param updates - Fields to update on the watchlist item
     * @returns Promise resolving to void when complete
     */
    updateWatchlistItem(
      this: DatabaseService,
      key: string,
      updates: WatchlistItemUpdate,
    ): Promise<void>

    /**
     * Updates watchlist items by matching GUID
     * @param guid - GUID to match against watchlist item GUIDs array
     * @param updates - Fields to update on matching watchlist items
     * @returns Promise resolving to the number of items updated
     */
    updateWatchlistItemByGuid(
      this: DatabaseService,
      guid: string,
      updates: {
        sonarr_instance_id?: number | null
        radarr_instance_id?: number | null
      },
    ): Promise<number>

    /**
     * Retrieves a specific watchlist item for a user
     * @param userId - ID of the user
     * @param key - Unique key of the watchlist item
     * @returns Promise resolving to the watchlist item if found, undefined otherwise
     */
    getWatchlistItem(
      this: DatabaseService,
      userId: number,
      key: string,
    ): Promise<WatchlistItem | undefined>

    /**
     * Retrieves watchlist items for multiple users and keys
     * @param userIds - Array of user IDs
     * @param keys - Array of watchlist item keys to filter by
     * @returns Promise resolving to an array of matching watchlist items
     */
    getBulkWatchlistItems(
      this: DatabaseService,
      userIds: number[],
      keys: string[],
    ): Promise<WatchlistItem[]>

    /**
     * Retrieves watchlist items by their keys
     * @param keys - Array of watchlist item keys to retrieve
     * @returns Promise resolving to an array of matching watchlist items
     */
    getWatchlistItemsByKeys(
      this: DatabaseService,
      keys: string[],
    ): Promise<WatchlistItem[]>

    /**
     * Bulk updates multiple watchlist items
     * @param updates - Array of watchlist item updates with user ID and key
     * @returns Promise resolving to the number of items updated
     */
    bulkUpdateWatchlistItems(
      this: DatabaseService,
      updates: Array<{
        userId: number
        key: string
        added?: string
        status?: WatchlistStatus
      }>,
    ): Promise<number>

    /**
     * Retrieves all GUIDs from watchlist items in an optimized way
     * @returns Promise resolving to array of lowercase GUIDs
     */
    getAllGuidsMapped(this: DatabaseService): Promise<string[]>

    /**
     * Gets notifications for a specific user and type
     * @param userId - ID of the user
     * @param type - Type of notification to fetch
     * @returns Promise resolving to array of notifications
     */
    getNotificationsForUser(
      this: DatabaseService,
      userId: number,
      type: string,
    ): Promise<Array<{ title: string }>>

    /**
     * Gets all watchlist items with their GUIDs for type-based filtering
     * @param types - Optional array of types to filter by (e.g., ['movie', 'show'])
     * @returns Promise resolving to array of items with their guids
     */
    getAllGuidsFromWatchlist(
      this: DatabaseService,
      types?: string[],
    ): Promise<Array<{ id: number; guids: string[] }>>

    /**
     * Checks for existing webhook notifications for given titles
     * @param userId - The user ID to check
     * @param titles - Array of titles to check for existing notifications
     * @returns Promise resolving to a map of title to boolean (true if notification exists)
     */
    checkExistingWebhooks(
      this: DatabaseService,
      userId: number,
      titles: string[],
    ): Promise<Map<string, boolean>>

    /**
     * Cross-database compatible GUID extraction
     * @returns Promise resolving to array of lowercase GUIDs
     */
    getUniqueGuidsRaw(this: DatabaseService): Promise<string[]>

    /**
     * Extracts all unique genres from watchlist items and ensures they exist in the genres table for use in genre routing
     * @returns Promise resolving to void when complete
     */
    syncGenresFromWatchlist(this: DatabaseService): Promise<void>

    /**
     * Adds a custom genre to the genres table
     * @param name - Name of the genre to add
     * @returns Promise resolving to the ID of the created genre
     */
    addCustomGenre(this: DatabaseService, name: string): Promise<number>

    /**
     * Retrieves all genres from the genres table
     * @returns Promise resolving to array of all genres
     */
    getAllGenres(
      this: DatabaseService,
    ): Promise<Array<{ id: number; name: string; is_custom: boolean }>>

    /**
     * Deletes a custom genre from the genres table
     * @param id - ID of the genre to delete
     * @returns Promise resolving to true if deleted, false otherwise
     */
    deleteCustomGenre(this: DatabaseService, id: number): Promise<boolean>

    /**
     * Bulk updates the status of show watchlist items
     * @param updates - Array of show status updates
     * @returns Promise resolving to the number of items updated
     */
    bulkUpdateShowStatuses(
      this: DatabaseService,
      updates: Array<{
        key: string
        userId: number
        added?: string
        status?: WatchlistStatus
      }>,
    ): Promise<number>

    /**
     * Retrieves all show watchlist items
     * @returns Promise resolving to array of all show watchlist items
     */
    getAllShowWatchlistItems(
      this: DatabaseService,
    ): Promise<TokenWatchlistItem[]>

    /**
     * Retrieves all movie watchlist items
     * @returns Promise resolving to array of all movie watchlist items
     */
    getAllMovieWatchlistItems(
      this: DatabaseService,
    ): Promise<TokenWatchlistItem[]>

    /**
     * Creates multiple watchlist items
     * @param items - Array of watchlist items to create
     * @param options - Configuration options for how to handle conflicts
     * @returns Promise resolving to void when complete
     */
    createWatchlistItems(
      this: DatabaseService,
      items: Omit<WatchlistItem, 'created_at' | 'updated_at'>[],
      options?: { onConflict?: 'ignore' | 'merge' },
    ): Promise<void>

    /**
     * Creates temporary RSS items for processing
     * @param items - Array of temporary RSS items to create
     * @returns Promise resolving to void when complete
     */
    createTempRssItems(
      this: DatabaseService,
      items: Array<{
        title: string
        type: string
        thumb?: string
        guids: string[]
        genres?: string[]
        source: 'self' | 'friends'
      }>,
    ): Promise<void>

    /**
     * Retrieves temporary RSS items
     * @param source - Optional source filter ('self' or 'friends')
     * @returns Promise resolving to array of temporary RSS items
     */
    getTempRssItems(
      this: DatabaseService,
      source?: 'self' | 'friends',
    ): Promise<
      Array<{
        id: number
        title: string
        type: string
        thumb: string | null
        guids: string[]
        genres: string[]
        source: 'self' | 'friends'
        created_at: string
      }>
    >

    /**
     * Deletes specific temporary RSS items by ID
     * @param ids - Array of item IDs to delete
     * @returns Promise resolving to void when complete
     */
    deleteTempRssItems(this: DatabaseService, ids: number[]): Promise<void>

    /**
     * Deletes all temporary RSS items
     * @param source - Optional source filter ('self' or 'friends')
     * @returns Promise resolving to void when complete
     */
    deleteAllTempRssItems(
      this: DatabaseService,
      source?: 'self' | 'friends',
    ): Promise<void>

    /**
     * Deletes watchlist items for a user
     * @param userId - ID of the user
     * @param keys - Array of watchlist item keys to delete
     * @returns Promise resolving to void when complete
     */
    deleteWatchlistItems(
      this: DatabaseService,
      userId: number,
      keys: string[],
    ): Promise<void>

    /**
     * Retrieves all watchlist items for a specific user
     * @param userId - ID of the user
     * @returns Promise resolving to array of all watchlist items for the user
     */
    getAllWatchlistItemsForUser(
      this: DatabaseService,
      userId: number,
    ): Promise<WatchlistItem[]>

    /**
     * Retrieves watchlist items that match a specific GUID
     * @param guid - GUID to match against watchlist items
     * @returns Promise resolving to array of matching watchlist items
     */
    getWatchlistItemsByGuid(
      this: DatabaseService,
      guid: string,
    ): Promise<TokenWatchlistItem[]>
  }
}
