import type {
  EtagUserInfo,
  Friend,
  FriendChangesResult,
  RssWatchlistResults,
  TemptRssWatchlistItem,
  TokenWatchlistItem,
  WatchlistGroup,
  Item as WatchlistItem,
} from '@root/types/plex.types.js'
import type { RssFeedsResponse } from '@schemas/plex/generate-rss-feeds.schema.js'
import {
  getGuidMatchScore,
  hasMatchingParsedGuids,
  parseGenres,
  parseGuids,
} from '@utils/guid-handler.js'
import { createServiceLogger } from '@utils/logger.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type { PlexLabelSyncService } from './plex-label-sync.service.js'
import {
  fetchSelfWatchlist,
  fetchWatchlistFromRss,
  getFriends,
  getOthersWatchlist,
  getPlexWatchlistUrls,
  pingPlex,
} from './plex-watchlist/index.js'
import {
  type NotificationDeps,
  sendWatchlistNotifications,
} from './plex-watchlist/notifications/notification-sender.js'
import {
  type ItemProcessorDeps,
  linkExistingItems,
  processAndSaveNewItems,
} from './plex-watchlist/orchestration/item-processor.js'
import {
  buildResponse,
  extractKeysAndRelationships,
  getExistingItems,
  type WatchlistSyncDeps,
} from './plex-watchlist/orchestration/watchlist-sync.js'
import { mapRssItemsToWatchlist } from './plex-watchlist/rss/rss-mapper.js'
import {
  categorizeItems,
  type ItemCategorizerDeps,
} from './plex-watchlist/sync/item-categorizer.js'
import {
  checkForRemovedFriends,
  clearUserCanSyncCache,
  ensureFriendUsers,
  ensureTokenUsers,
  type FriendUsersDeps,
  getUserCanSync,
} from './plex-watchlist/users/index.js'

export class PlexWatchlistService {
  /** Creates a fresh service logger that inherits current log level */
  private get log(): FastifyBaseLogger {
    return createServiceLogger(this.baseLog, 'PLEX_WATCHLIST')
  }

  constructor(
    private readonly baseLog: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
    private readonly dbService: FastifyInstance['db'],
    private readonly plexLabelSyncService?: PlexLabelSyncService,
  ) {}

  private get config() {
    return this.fastify.config
  }

  /** Gets the common dependencies object for user-related operations */
  private get userDeps(): FriendUsersDeps {
    return {
      config: this.config,
      db: this.dbService,
      logger: this.log,
      fastify: this.fastify,
    }
  }

  /** Gets the dependencies object for notification operations */
  private get notificationDeps(): NotificationDeps {
    return {
      db: this.dbService,
      logger: this.log,
      fastify: this.fastify,
    }
  }

  /** Gets the dependencies object for item categorization operations */
  private get categorizerDeps(): ItemCategorizerDeps {
    return {
      logger: this.log,
    }
  }

  /** Gets the dependencies object for watchlist sync operations */
  private get watchlistSyncDeps(): WatchlistSyncDeps {
    return {
      db: this.dbService,
      logger: this.log,
    }
  }

  /** Gets the dependencies object for item processor operations */
  private get itemProcessorDeps(): ItemProcessorDeps {
    return {
      db: this.dbService,
      logger: this.log,
      config: this.config,
      progress: this.fastify.progress,
      plexLabelSyncService: this.plexLabelSyncService,
      handleLinkedItemsForLabelSync:
        this.handleLinkedItemsForLabelSync.bind(this),
    }
  }

  /**
   * Gets user sync permission with caching to avoid repeated DB lookups
   *
   * @param userId - The user ID to check
   * @returns Promise resolving to boolean indicating if user can sync
   */
  private async getUserCanSync(userId: number): Promise<boolean> {
    return getUserCanSync(userId, { db: this.dbService, logger: this.log })
  }

  /**
   * Gets parsed GUIDs with caching to avoid repeated parsing
   *
   * @param guidCache - Cache Map to store parsed results
   * @param source - Source GUIDs to parse
   * @returns Array of parsed GUIDs
   */
  private getParsedGuids(
    guidCache: Map<string, string[]>,
    source: string | string[],
  ): string[] {
    // Handle undefined or null case
    if (!source) {
      return []
    }

    // Create a cache key
    const cacheKey =
      typeof source === 'string' ? source : JSON.stringify(source)

    // Return from cache if available
    if (guidCache.has(cacheKey)) {
      const cachedValue = guidCache.get(cacheKey)
      if (cachedValue) {
        return cachedValue
      }
    }

    // Parse and cache if not available
    const parsed = parseGuids(source)
    guidCache.set(cacheKey, parsed)
    return parsed
  }

  /**
   * Sends watchlist notifications to a user via Discord and Apprise.
   * Records the notification in the database if any notification method succeeds.
   *
   * @param user - User to notify (must include userId)
   * @param item - Watchlist item details
   * @returns Promise resolving to boolean indicating if any notifications were sent
   */
  async sendWatchlistNotifications(
    user: Friend & { userId: number },
    item: {
      id?: number | string
      title: string
      type: string
      thumb?: string
    },
  ): Promise<boolean> {
    return sendWatchlistNotifications(user, item, this.notificationDeps)
  }

  async pingPlex(): Promise<boolean> {
    const tokens = this.config.plexTokens

    if (tokens.length === 0) {
      throw new Error('No Plex tokens configured')
    }

    const results = await Promise.all(
      tokens.map((token, _index) => {
        return pingPlex(token, this.log)
      }),
    )

    return results.every((result) => result === true)
  }

  async getSelfWatchlist(forceRefresh = false) {
    if (this.config.plexTokens.length === 0) {
      throw new Error('No Plex token configured')
    }

    // Ensure users exist for tokens (this populates the database)
    await this.ensureTokenUsers()

    // Get the primary user directly
    const primaryUser = await this.dbService.getPrimaryUser()
    if (!primaryUser) {
      throw new Error('Primary Plex user not found')
    }

    const userWatchlistMap = new Map<Friend, Set<TokenWatchlistItem>>()

    // Now use just the first token (for now we only support one)
    const token = this.config.plexTokens[0]
    const tokenConfig = {
      ...this.config,
      plexTokens: [token],
    }

    // Fetch items with the primary user ID and database fallback
    const items = await fetchSelfWatchlist(
      tokenConfig,
      this.log,
      primaryUser.id,
      (userId: number) => this.dbService.getAllWatchlistItemsForUser(userId),
    )

    // Use the primary user's actual data
    const tokenUser: Friend = {
      watchlistId: primaryUser.name,
      username: primaryUser.name,
      userId: primaryUser.id,
    }

    userWatchlistMap.set(tokenUser, items)

    // Don't error out if a user has no items in their watch list.
    if (userWatchlistMap.size === 0) {
      this.log.debug('No items in self watchlist, returning empty result')
      return {
        total: 0,
        users: [],
      }
    }

    const { allKeys, userKeyMap } = extractKeysAndRelationships(
      userWatchlistMap,
      this.watchlistSyncDeps,
    )
    const existingItems = await getExistingItems(
      userKeyMap,
      allKeys,
      this.watchlistSyncDeps,
    )
    const { brandNewItems, existingItemsToLink } = this.categorizeItems(
      userWatchlistMap,
      existingItems,
      forceRefresh,
    )

    const processedItems = await processAndSaveNewItems(
      brandNewItems,
      true,
      forceRefresh,
      this.itemProcessorDeps,
    )
    await linkExistingItems(existingItemsToLink, {
      db: this.dbService,
      logger: this.log,
      handleLinkedItemsForLabelSync:
        this.handleLinkedItemsForLabelSync.bind(this),
    })

    const allItemsMap = new Map<Friend, Set<WatchlistItem>>()

    for (const item of existingItems) {
      const user = Array.from(userWatchlistMap.keys()).find(
        (u) => u.userId === item.user_id,
      )
      if (user) {
        const userItems = allItemsMap.get(user) || new Set<WatchlistItem>()
        userItems.add(item)
        allItemsMap.set(user, userItems)
      }
    }

    for (const [user, items] of processedItems.entries()) {
      const existingUserItems =
        allItemsMap.get(user) || new Set<WatchlistItem>()
      for (const item of items) {
        if (!existingUserItems.has(item)) {
          existingUserItems.add(item)
        }
      }
      allItemsMap.set(user, existingUserItems)
    }

    await this.matchRssPendingItemsSelf(
      allItemsMap as Map<Friend, Set<TokenWatchlistItem>>,
    )

    await this.checkForRemovedItems(userWatchlistMap)

    return buildResponse(
      userWatchlistMap,
      existingItems,
      existingItemsToLink,
      processedItems,
    )
  }

  async generateAndSaveRssFeeds(): Promise<RssFeedsResponse> {
    const tokens = this.config.plexTokens
    if (tokens.length === 0) {
      return { error: 'No Plex token configured' }
    }

    const tokenSet: Set<string> = new Set(tokens)
    const skipFriendSync = this.config.skipFriendSync || false

    const watchlistUrls = await getPlexWatchlistUrls(
      tokenSet,
      skipFriendSync,
      this.log,
    )

    if (watchlistUrls.size === 0) {
      return { error: 'Unable to fetch watchlist URLs' }
    }

    const dbUrls = {
      selfRss: Array.from(watchlistUrls)[0] || '',
      friendsRss: Array.from(watchlistUrls)[1] || '',
    }

    // Persist to database first
    await this.dbService.updateConfig(dbUrls)

    // Then update in-memory config
    try {
      await this.fastify.updateConfig(dbUrls)
      this.log.debug(dbUrls, 'RSS feed URLs saved to database and memory')
    } catch (memUpdateErr) {
      this.log.error(
        { error: memUpdateErr },
        'DB updated but failed to sync in-memory config - restart may be needed',
      )
      // In-memory config is stale but DB has correct value
      // Next server restart will load correct value from DB
    }

    return {
      self: dbUrls.selfRss,
      friends: dbUrls.friendsRss,
    }
  }

  /**
   * Check for friend changes only (lightweight operation for ETag-based sync).
   * Returns added/removed users without fetching full watchlists.
   */
  async checkFriendChanges(): Promise<FriendChangesResult> {
    if (this.config.plexTokens.length === 0) {
      throw new Error('No Plex token configured')
    }

    const friendsResult = await getFriends(this.config, this.log)

    // Guard against API failures to prevent data loss
    if (!friendsResult.success) {
      this.log.warn(
        'Friend API completely failed - skipping cleanup to prevent data loss',
      )
      return { added: [], removed: [], userMap: new Map() }
    }

    // Ensure token users are up-to-date before cleanup (handles username changes)
    await this.ensureTokenUsers()

    // Check for and remove users who are no longer friends
    const removed = await this.checkForRemovedFriends(friendsResult.friends)

    // Ensure friend users exist and track newly added
    const { userMap, added } = await this.ensureFriendUsers(
      friendsResult.friends,
    )

    if (added.length > 0) {
      this.log.info(
        { count: added.length, usernames: added.map((u) => u.username) },
        'New friends detected',
      )
    }

    return { added, removed, userMap }
  }

  async getOthersWatchlists(forceRefresh = false) {
    if (this.config.plexTokens.length === 0) {
      throw new Error('No Plex token configured')
    }

    const friendsResult = await getFriends(this.config, this.log)

    // Guard against API failures to prevent data loss
    if (!friendsResult.success) {
      this.log.warn(
        'Friend API completely failed - skipping cleanup to prevent data loss',
      )
      return {
        total: 0,
        users: [],
      }
    }

    if (friendsResult.hasApiErrors) {
      this.log.warn(
        'Partial friend API failures detected - proceeding with available data',
      )
    }

    // Ensure token users are up-to-date before cleanup (handles username changes)
    await this.ensureTokenUsers()

    // Check for and remove users who are no longer friends
    // This should happen after token users are ensured to prevent accidental deletion
    await this.checkForRemovedFriends(friendsResult.friends)

    // Early check for no friends
    if (friendsResult.friends.size === 0) {
      this.log.debug('You do not appear to have any friends... 😢')
      return {
        total: 0,
        users: [],
      }
    }

    const { userMap } = await this.ensureFriendUsers(friendsResult.friends)

    const friendsWithIds = new Set(
      Array.from(friendsResult.friends)
        .map(([friend, token]) => {
          const userId = userMap.get(friend.watchlistId)
          if (!userId) {
            this.log.warn(
              `No user ID found for friend with watchlist ID: ${friend.watchlistId}`,
            )
            return null
          }
          return [{ ...friend, userId }, token] as [
            Friend & { userId: number },
            string,
          ]
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null),
    )

    const userWatchlistMap = await getOthersWatchlist(
      this.config,
      this.log,
      friendsWithIds,
      (userId: number) => this.dbService.getAllWatchlistItemsForUser(userId),
    )

    // Only throw error if expected to have items but got none
    if (userWatchlistMap.size === 0 && friendsWithIds.size > 0) {
      throw new Error("Unable to fetch others' watchlist items")
    }

    // If no friends or no watchlist items, return an empty result structure
    if (userWatchlistMap.size === 0) {
      return {
        total: 0,
        users: [],
      }
    }

    const { allKeys, userKeyMap } = extractKeysAndRelationships(
      userWatchlistMap,
      this.watchlistSyncDeps,
    )
    const existingItems = await getExistingItems(
      userKeyMap,
      allKeys,
      this.watchlistSyncDeps,
    )
    const { brandNewItems, existingItemsToLink } = this.categorizeItems(
      userWatchlistMap,
      existingItems,
      forceRefresh,
    )

    const processedItems = await processAndSaveNewItems(
      brandNewItems,
      false,
      forceRefresh,
      this.itemProcessorDeps,
    )
    await linkExistingItems(existingItemsToLink, {
      db: this.dbService,
      logger: this.log,
      handleLinkedItemsForLabelSync:
        this.handleLinkedItemsForLabelSync.bind(this),
    })

    const allItemsMap = new Map<Friend, Set<WatchlistItem>>()

    for (const [user, items] of processedItems.entries()) {
      allItemsMap.set(user, items)
    }

    for (const item of existingItems) {
      const user = Array.from(userWatchlistMap.keys()).find(
        (u) => u.userId === item.user_id,
      )
      if (user) {
        const userItems = allItemsMap.get(user) || new Set<WatchlistItem>()
        userItems.add(item)
        allItemsMap.set(user, userItems)
      }
    }

    await this.matchRssPendingItemsFriends(
      allItemsMap as Map<Friend, Set<TokenWatchlistItem>>,
    )

    await this.checkForRemovedItems(userWatchlistMap)

    return buildResponse(
      userWatchlistMap,
      existingItems,
      existingItemsToLink,
      processedItems,
    )
  }

  /**
   * Ensures users exist for each Plex token in the configuration.
   * Fetches actual usernames from Plex API, creates new users if needed,
   * and marks the first token as the primary user.
   *
   * @returns Map of Plex usernames to user IDs
   */
  private async ensureTokenUsers(): Promise<Map<string, number>> {
    return ensureTokenUsers(this.userDeps)
  }

  /**
   * Ensures friend users exist in the database and tracks newly added friends.
   *
   * @param friends - Set of friends from Plex API
   * @returns Map of watchlist IDs to user IDs, plus list of newly added users
   */
  private async ensureFriendUsers(
    friends: Set<[Friend, string]>,
  ): Promise<{ userMap: Map<string, number>; added: EtagUserInfo[] }> {
    return ensureFriendUsers(friends, this.userDeps)
  }

  /**
   * Categorizes watchlist items into brand new items and existing items to link.
   * When forceRefresh is enabled, treats all items as new for metadata re-fetching.
   */
  private categorizeItems(
    userWatchlistMap: Map<Friend, Set<TokenWatchlistItem>>,
    existingItems: WatchlistItem[],
    forceRefresh = false,
  ) {
    return categorizeItems(
      userWatchlistMap,
      existingItems,
      this.categorizerDeps,
      forceRefresh,
    )
  }

  async processRssWatchlists(): Promise<RssWatchlistResults> {
    const config = await this.ensureRssFeeds()

    const results: RssWatchlistResults = {
      self: {
        total: 0,
        users: [],
      },
      friends: {
        total: 0,
        users: [],
      },
    }

    if (config.selfRss) {
      results.self = await this.processSelfRssWatchlist(config.selfRss)
    }

    if (config.friendsRss) {
      results.friends = await this.processFriendsRssWatchlist(config.friendsRss)
    }

    return results
  }

  /**
   * Process RSS watchlists with real user details for API responses
   * This method is optimized for API endpoints that need actual user information
   */
  async processRssWatchlistsWithUserDetails(): Promise<RssWatchlistResults> {
    const results = await this.processRssWatchlists()

    // Lazy load primary user details only when needed for API response
    if (results.self.users.length > 0) {
      const primaryUser = await this.dbService.getPrimaryUser()
      if (primaryUser) {
        results.self.users[0].user = {
          watchlistId: primaryUser.name,
          username: primaryUser.name,
          userId: primaryUser.id,
        }
      }
    }

    return results
  }

  private async ensureRssFeeds(): Promise<{
    selfRss?: string
    friendsRss?: string
  }> {
    const config = this.config

    if (!config?.selfRss && !config?.friendsRss) {
      this.log.debug(
        'No RSS feeds found in configuration, attempting to generate...',
      )
      await this.generateAndSaveRssFeeds()
      const updatedConfig = await this.dbService.getConfig()

      // Sync the in-memory config with the updated RSS feeds
      if (updatedConfig) {
        await this.fastify.updateConfig({
          selfRss: updatedConfig.selfRss,
          friendsRss: updatedConfig.friendsRss,
        })
      }

      if (!updatedConfig?.selfRss && !updatedConfig?.friendsRss) {
        throw new Error('Unable to generate or retrieve RSS feed URLs')
      }

      return updatedConfig
    }

    return config
  }

  async storeRssWatchlistItems(
    items: Set<TemptRssWatchlistItem>,
    source: 'self' | 'friends',
    routedGuids?: Set<string>,
  ): Promise<void> {
    const formattedItems = Array.from(items).map((item) => {
      const itemGuids = parseGuids(item.guids)
      // Check if any of this item's GUIDs were routed
      const isRouted = routedGuids
        ? itemGuids.some((g) => routedGuids.has(g.toLowerCase()))
        : false

      return {
        title: item.title,
        type: item.type,
        thumb: item.thumb || undefined,
        guids: itemGuids,
        genres: parseGenres(item.genres),
        source: source,
        routed: isRouted,
      }
    })

    if (formattedItems.length > 0) {
      await this.dbService.createTempRssItems(formattedItems)
      await this.dbService.syncGenresFromWatchlist()
      this.log.debug(`Stored ${formattedItems.length} RSS items for ${source}`)
    }
  }

  private async processSelfRssWatchlist(
    rssUrl: string,
  ): Promise<{ total: number; users: WatchlistGroup[] }> {
    const selfItems = await fetchWatchlistFromRss(
      rssUrl,
      'selfRSS',
      1,
      this.log,
    )

    const watchlistGroup: WatchlistGroup = {
      user: {
        watchlistId: 'self',
        username: 'Self Watchlist',
        userId: 1,
      },
      watchlist: this.mapRssItemsToWatchlist(
        selfItems as Set<TemptRssWatchlistItem>,
      ),
    }
    return {
      total: selfItems.size,
      users: [watchlistGroup],
    }
  }

  private async processFriendsRssWatchlist(
    rssUrl: string,
  ): Promise<{ total: number; users: WatchlistGroup[] }> {
    const friendsItems = await fetchWatchlistFromRss(
      rssUrl,
      'friendsRSS',
      1,
      this.log,
    )

    const watchlistGroup: WatchlistGroup = {
      user: {
        watchlistId: 'friends',
        username: 'Friends Watchlist',
        userId: 1,
      },
      watchlist: this.mapRssItemsToWatchlist(
        friendsItems as Set<TemptRssWatchlistItem>,
      ),
    }
    return {
      total: friendsItems.size,
      users: [watchlistGroup],
    }
  }

  /**
   * Maps RSS items to the watchlist display format.
   */
  private mapRssItemsToWatchlist(items: Set<TemptRssWatchlistItem>) {
    return mapRssItemsToWatchlist(items)
  }

  async matchRssPendingItemsSelf(
    userWatchlistMap: Map<Friend, Set<TokenWatchlistItem>>,
  ): Promise<void> {
    return this.processRssPendingItems(userWatchlistMap, 'self')
  }

  async matchRssPendingItemsFriends(
    userWatchlistMap: Map<Friend, Set<TokenWatchlistItem>>,
  ): Promise<void> {
    return this.processRssPendingItems(userWatchlistMap, 'friends')
  }

  private async handleRemovedItems(
    userId: number,
    currentKeys: Set<string>,
    fetchedKeys: Set<string>,
  ): Promise<void> {
    const removedKeys = Array.from(currentKeys).filter(
      (key) => !fetchedKeys.has(key),
    )

    if (removedKeys.length > 0) {
      this.log.debug(
        `Detected ${removedKeys.length} removed items for user ${userId}`,
      )

      // Get the watchlist items that will be deleted for label cleanup
      if (this.plexLabelSyncService) {
        try {
          const itemsToDelete =
            await this.dbService.getWatchlistItemsByKeys(removedKeys)
          // Filter to only items belonging to this user
          const userItemsToDelete = itemsToDelete.filter(
            (item) => item.user_id === userId,
          )

          if (userItemsToDelete.length > 0) {
            const labelCleanupItems = userItemsToDelete.map((item) => ({
              id: item.id, // Already typed correctly by getWatchlistItemsByKeys
              title: item.title,
              key: item.key,
              user_id: item.user_id,
              guids: parseGuids(item.guids), // Add GUID array
              contentType: (item.type === 'show' ? 'show' : 'movie') as
                | 'movie'
                | 'show', // Add content type
            }))
            await this.plexLabelSyncService.cleanupLabelsForWatchlistItems(
              labelCleanupItems,
            )
          }
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error))
          this.log.error(
            {
              error: err,
              stack: err.stack,
              userId,
              removedKeys,
            },
            'Failed to cleanup labels for removed watchlist items:',
          )
          // Continue with deletion even if label cleanup fails
        }
      }

      await this.dbService.deleteWatchlistItems(userId, removedKeys)
    }
  }

  /**
   * Handles items that were just linked to users by queuing them for label sync
   */
  private async handleLinkedItemsForLabelSync(
    linkItems: WatchlistItem[],
  ): Promise<void> {
    if (!this.plexLabelSyncService || linkItems.length === 0) {
      return
    }

    try {
      // Get the database items with IDs after linking
      const keys = linkItems.map((item) => item.key)

      const dbItems = await this.dbService.getWatchlistItemsByKeys(keys)

      // Create composite key index for O(1) lookups instead of O(n) Array.find
      const byKeyUser = new Map<string, { id: number; title: string }>()
      for (const item of dbItems) {
        if (
          item.key &&
          typeof item.user_id === 'number' &&
          typeof item.id === 'number'
        ) {
          byKeyUser.set(`${item.key}:${item.user_id}`, {
            id: item.id,
            title: item.title,
          })
        }
      }

      // Group by unique content key to avoid duplicate pending syncs
      // This mimics the content-centric approach used in full sync
      const contentMap = new Map<
        string,
        { title: string; watchlistIds: number[] }
      >()
      const userCounts = new Map<number, number>()

      for (const linkItem of linkItems) {
        // O(1) lookup using composite key instead of O(n) Array.find
        const dbItem = byKeyUser.get(`${linkItem.key}:${linkItem.user_id}`)

        if (dbItem?.id && linkItem.key && typeof dbItem.id === 'number') {
          // Group by content key
          if (!contentMap.has(linkItem.key)) {
            contentMap.set(linkItem.key, {
              title: linkItem.title,
              watchlistIds: [],
            })
          }

          const contentEntry = contentMap.get(linkItem.key)
          if (contentEntry) {
            contentEntry.watchlistIds.push(dbItem.id)
          }

          // Count per user for logging
          const count = userCounts.get(linkItem.user_id) || 0
          userCounts.set(linkItem.user_id, count + 1)
        }
      }

      // Queue one pending sync per unique content (not per watchlist item)
      // This ensures all users for the same content are processed together
      let totalQueued = 0
      for (const [_contentKey, content] of contentMap.entries()) {
        // Queue using the first watchlist ID as representative
        // The processing will find ALL users with this content when processing
        await this.plexLabelSyncService.queuePendingLabelSyncByWatchlistId(
          content.watchlistIds[0],
          content.title,
        )
        totalQueued++
      }

      // Log per user
      for (const [userId, count] of userCounts.entries()) {
        this.log.debug(`Detected ${count} re-added items for user ${userId}`)
      }

      if (totalQueued > 0) {
        this.log.debug(
          `Queued ${totalQueued} unique content items for label synchronization (grouped from ${linkItems.length} re-added items)`,
        )
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      this.log.error(
        {
          error: err,
          stack: err.stack,
          linkItemsCount: linkItems.length,
          linkItemsSample: linkItems.slice(0, 3).map((item) => ({
            title: item.title,
            key: item.key,
            user_id: item.user_id,
          })),
        },
        'Failed to queue re-added items for label sync:',
      )
      throw error // Re-throw to see the full error chain
    }
  }

  private async checkForRemovedItems(
    userWatchlistMap: Map<Friend, Set<TokenWatchlistItem>>,
  ): Promise<void> {
    for (const [user, items] of userWatchlistMap.entries()) {
      const currentItems = await this.dbService.getAllWatchlistItemsForUser(
        user.userId,
      )

      const currentKeys = new Set(currentItems.map((item) => item.key))
      const fetchedKeys = new Set(Array.from(items).map((item) => item.id))

      await this.handleRemovedItems(user.userId, currentKeys, fetchedKeys)
    }
  }

  /**
   * Checks for and removes users who are no longer in the current friends list.
   * Users not found in the friends list are deleted, cascading to their watchlist items.
   *
   * @param currentFriends - Set of current friends from Plex API
   * @returns List of removed users for ETag cache invalidation
   */
  private async checkForRemovedFriends(
    currentFriends: Set<[Friend, string]>,
  ): Promise<EtagUserInfo[]> {
    return checkForRemovedFriends(currentFriends, this.userDeps)
  }

  /**
   * Prepares notification and GUID caches for RSS item matching
   *
   * @param userWatchlistMap - Map of users to their watchlist items
   * @returns Object containing the prepared caches
   */
  private async prepareRssMatchingCaches(
    userWatchlistMap: Map<Friend, Set<TokenWatchlistItem>>,
  ): Promise<{
    guidCache: Map<string, string[]>
    notificationChecks: Map<number, Map<string, boolean>>
  }> {
    // Cache for parsed GUIDs
    const guidCache = new Map<string, string[]>()

    // Cache for notification checks
    const notificationChecks = new Map<number, Map<string, boolean>>()

    // Pre-process items to build title cache for each user
    const userItemTitles = new Map<number, string[]>()

    for (const [user, items] of userWatchlistMap.entries()) {
      const titles: string[] = []
      for (const item of items) {
        if (item.title) {
          titles.push(item.title)
        }
      }
      userItemTitles.set(user.userId, titles)
    }

    // Prefetch all notification checks at once
    await Promise.all(
      Array.from(userItemTitles.entries()).map(async ([userId, titles]) => {
        if (titles.length > 0) {
          const checks = await this.dbService.checkExistingWebhooks(
            userId,
            titles,
          )
          notificationChecks.set(userId, checks)
        }
      }),
    )

    return { guidCache, notificationChecks }
  }

  /**
   * Process pending RSS items for matching and notification
   *
   * @param userWatchlistMap - Map of users to their watchlist items
   * @param source - Source of RSS items ('self' or 'friends')
   * @returns Promise resolving when processing is complete
   */
  private async processRssPendingItems(
    userWatchlistMap: Map<Friend, Set<TokenWatchlistItem>>,
    source: 'self' | 'friends',
  ): Promise<void> {
    // Clear user sync cache for fresh permissions per operation
    clearUserCanSyncCache()

    // Prefetch can_sync for users to avoid repeated lookups during RSS matching
    const enabledUserIds = new Set<number>()
    await Promise.all(
      Array.from(userWatchlistMap.keys()).map(async (user) => {
        if (!user?.userId) return
        const canSync = await this.getUserCanSync(user.userId)
        if (canSync) enabledUserIds.add(user.userId)
      }),
    )
    if (enabledUserIds.size === 0) {
      this.log.debug(
        `All users in RSS ${source} batch have sync disabled; skipping RSS processing`,
      )
      return
    }

    const pendingItems = await this.dbService.getTempRssItems(source)
    this.log.debug(
      `Found ${pendingItems.length} pending RSS items to match during ${source} sync`,
    )

    if (pendingItems.length === 0) {
      return
    }

    // Tracking statistics
    let matchCount = 0
    let noMatchCount = 0
    let duplicateCount = 0
    const matchedItemIds: number[] = []
    const duplicateItemIds: number[] = []

    // Prepare caches for efficient matching
    const { guidCache, notificationChecks } =
      await this.prepareRssMatchingCaches(userWatchlistMap)

    // Process each pending item
    for (const pendingItem of pendingItems) {
      const pendingGuids = this.getParsedGuids(guidCache, pendingItem.guids)

      // Collect all potential matches with their scores
      const potentialMatches: Array<{
        user: Friend
        item: TokenWatchlistItem
        score: number
        matchingGuids: string[]
      }> = []

      for (const [user, items] of userWatchlistMap.entries()) {
        for (const item of items) {
          const itemGuids = this.getParsedGuids(guidCache, item.guids || [])
          const score = getGuidMatchScore(pendingGuids, itemGuids)

          // Only consider items that pass the threshold check
          if (hasMatchingParsedGuids(pendingGuids, itemGuids)) {
            potentialMatches.push({
              user,
              item,
              score,
              matchingGuids: pendingGuids.filter((g) => itemGuids.includes(g)),
            })
          }
        }
      }

      // Find the best match (highest score)
      if (potentialMatches.length > 0) {
        // Sort by score descending (highest first)
        potentialMatches.sort((a, b) => b.score - a.score)
        const bestMatch = potentialMatches[0]

        matchCount++
        matchedItemIds.push(pendingItem.id)

        this.log.debug(
          { userId: bestMatch.user.userId, matchScore: bestMatch.score },
          `Matched item "${pendingItem.title}" to user ${bestMatch.user.username}'s item "${bestMatch.item.title}" (score: ${bestMatch.score})`,
        )

        // Check if notification should be sent
        let shouldSendNotification = true

        // Check if item was actually routed (route-only notifications)
        if (!pendingItem.routed) {
          this.log.debug(
            { itemTitle: bestMatch.item.title, userId: bestMatch.user.userId },
            `Skipping notification for "${bestMatch.item.title}" - content was not routed to Radarr/Sonarr`,
          )
          shouldSendNotification = false
        }

        // Check if already notified (using prefetched data)
        if (shouldSendNotification) {
          const userNotifications = notificationChecks.get(
            bestMatch.user.userId,
          )
          if (userNotifications?.get(bestMatch.item.title)) {
            this.log.debug(
              `Skipping notification for "${bestMatch.item.title}" - already sent previously to user ID ${bestMatch.user.userId}`,
            )
            shouldSendNotification = false
          }
        }

        // Send notification if needed and user has sync enabled
        if (
          shouldSendNotification &&
          enabledUserIds.has(bestMatch.user.userId)
        ) {
          await this.sendWatchlistNotifications(bestMatch.user, {
            id: bestMatch.item.id,
            title: bestMatch.item.title,
            type: bestMatch.item.type || 'unknown',
            thumb: bestMatch.item.thumb,
          })

          // Update in-memory cache to prevent duplicate notifications in same batch
          let userNotifications = notificationChecks.get(bestMatch.user.userId)
          if (!userNotifications) {
            userNotifications = new Map()
            notificationChecks.set(bestMatch.user.userId, userNotifications)
          }
          userNotifications.set(bestMatch.item.title, true)
        } else if (
          shouldSendNotification &&
          !enabledUserIds.has(bestMatch.user.userId)
        ) {
          this.log.debug(
            { userId: bestMatch.user.userId, itemTitle: bestMatch.item.title },
            `Skipping RSS notification for "${bestMatch.item.title}" - user ${bestMatch.user.username} (ID: ${bestMatch.user.userId}) has sync disabled`,
          )
        }
      }

      // Handle non-matching items
      if (potentialMatches.length === 0) {
        noMatchCount++

        let existsInDatabase = false

        // Check if item already exists in database
        for (const guid of pendingGuids) {
          const normalizedGuid = guid.toLowerCase()
          try {
            const existingItems =
              await this.dbService.getWatchlistItemsByGuid(normalizedGuid)

            if (existingItems && existingItems.length > 0) {
              existsInDatabase = true
              this.log.debug(
                {
                  itemTitle: pendingItem.title,
                  guid,
                  matchCount: existingItems.length,
                },
                `RSS item "${pendingItem.title}" already exists in watchlist database with GUID ${guid}`,
              )
              break
            }
          } catch (error) {
            this.log.error(
              { error },
              `Error checking database for GUID ${guid}:`,
            )
          }
        }

        if (existsInDatabase) {
          duplicateCount++
          duplicateItemIds.push(pendingItem.id)
        } else {
          this.log.warn(
            { itemTitle: pendingItem.title },
            `No match found for ${source} RSS item "${pendingItem.title}" (possibly recently removed from watchlist)`,
          )
          matchedItemIds.push(pendingItem.id)
        }
      }
    }

    // Clean up processed items
    const allIdsToDelete = [...matchedItemIds, ...duplicateItemIds]
    if (allIdsToDelete.length > 0) {
      await this.dbService.deleteTempRssItems(allIdsToDelete)
    }

    this.log.debug(
      {
        totalChecked: pendingItems.length,
        matched: matchCount,
        unmatched: noMatchCount,
        duplicatesCleanedUp: duplicateCount,
        remainingUnmatched: noMatchCount - duplicateCount,
      },
      `${source} RSS matching complete`,
    )
  }
}
