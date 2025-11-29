import type { User } from '@root/types/config.types.js'
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
import {
  fetchSelfWatchlist,
  fetchWatchlistFromRss,
  getFriends,
  getOthersWatchlist,
  getPlexWatchlistUrls,
  pingPlex,
  processWatchlistItems,
} from '@utils/plex/index.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import pLimit from 'p-limit'
import type { PlexLabelSyncService } from './plex-label-sync.service.js'

export class PlexWatchlistService {
  // Cache for user sync permissions to avoid repeated DB lookups
  private userCanSyncCache = new Map<number, boolean>()
  // In-flight promise map to prevent concurrent DB hits for the same user
  private userCanSyncInFlight = new Map<number, Promise<boolean>>()
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

  /**
   * Creates default quota configurations for a newly created user using the quota service.
   */
  private async createDefaultQuotasForUser(userId: number): Promise<void> {
    try {
      const quotas = await this.fastify.quotaService.setupDefaultQuotas(userId)

      const createdQuotas = []
      if (quotas.movieQuota) createdQuotas.push('movie')
      if (quotas.showQuota) createdQuotas.push('show')

      if (createdQuotas.length > 0) {
        this.log.debug(
          `Created default quotas for user ${userId}: ${createdQuotas.join(', ')}`,
        )
      }
    } catch (error) {
      this.log.error(
        { error, userId },
        'Failed to create default quotas for user',
      )
    }
  }

  /**
   * Gets user sync permission with caching to avoid repeated DB lookups
   *
   * @param userId - The user ID to check
   * @returns Promise resolving to boolean indicating if user can sync
   */
  private async getUserCanSync(userId: number): Promise<boolean> {
    const cached = this.userCanSyncCache.get(userId)
    if (cached !== undefined) return cached

    const inflight = this.userCanSyncInFlight.get(userId)
    if (inflight) return inflight

    const p = (async () => {
      try {
        const dbUser = await this.dbService.getUser(userId)
        const canSync = dbUser?.can_sync ?? false
        this.userCanSyncCache.set(userId, canSync)
        return canSync
      } catch (error) {
        this.log.error(
          { error, userId },
          'Failed to fetch user can_sync; treating as disabled',
        )
        this.userCanSyncCache.set(userId, false)
        return false
      } finally {
        this.userCanSyncInFlight.delete(userId)
      }
    })()

    this.userCanSyncInFlight.set(userId, p)
    return p
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
   * Sends watchlist notifications to a user
   *
   * @param user - User to notify
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
    // Check if user has sync enabled before sending any notifications
    const canSync = await this.getUserCanSync(user.userId)
    if (!canSync) {
      const name = user.username ?? 'Unknown User'
      this.log.debug(
        { userId: user.userId },
        `Skipping notification for user ${name} (ID: ${user.userId}) - sync disabled`,
      )
      return false
    }

    const username = user.username || 'Unknown User'
    let discordSent = false
    let appriseSent = false

    // Send Discord notification (simplified without discord_id check)
    try {
      // Runtime type guard to ensure valid Discord type (case-insensitive)
      const t = typeof item.type === 'string' ? item.type.toLowerCase() : ''
      const discordType: 'movie' | 'show' =
        t === 'movie' || t === 'show' ? (t as 'movie' | 'show') : 'movie'

      discordSent = await this.fastify.discord.sendMediaNotification({
        username,
        title: item.title,
        type: discordType,
        posterUrl: item.thumb,
      })

      this.log.debug(
        { success: discordSent },
        `Notified Discord admin endpoints that ${username} added "${item.title}"`,
      )
    } catch (error) {
      this.log.error(
        {
          error,
          username,
          title: item.title,
          type: item.type,
          userId: user.userId,
        },
        'Error sending Discord webhook notification',
      )
    }

    // Send Apprise notification
    if (this.fastify.apprise?.isEnabled()) {
      try {
        appriseSent =
          await this.fastify.apprise.sendWatchlistAdditionNotification({
            title: item.title,
            type:
              typeof item.type === 'string'
                ? item.type.toLowerCase()
                : 'unknown',
            addedBy: {
              name: username,
            },
            posterUrl: item.thumb,
          })

        this.log.debug(
          { success: appriseSent },
          `Notified Apprise admin endpoints that ${username} added "${item.title}"`,
        )
      } catch (error) {
        this.log.error(
          {
            error,
            username,
            title: item.title,
            type: item.type,
            userId: user.userId,
          },
          'Error sending Apprise notification',
        )
      }
    }

    // Record notification if either method succeeded
    if (discordSent || appriseSent) {
      const itemId =
        typeof item.id === 'string' ? Number.parseInt(item.id, 10) : item.id

      await this.dbService.createNotificationRecord({
        watchlist_item_id:
          itemId !== undefined && !Number.isNaN(itemId) ? itemId : null,
        user_id: user.userId,
        type: 'watchlist_add',
        title: item.title,
        message: `New ${item.type} added to watchlist`,
        sent_to_discord: discordSent,
        sent_to_apprise: appriseSent,
        sent_to_webhook: true,
      })

      return true
    }

    return false
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

    const { allKeys, userKeyMap } =
      this.extractKeysAndRelationships(userWatchlistMap)
    const existingItems = await this.getExistingItems(userKeyMap, allKeys)
    const { brandNewItems, existingItemsToLink } = this.categorizeItems(
      userWatchlistMap,
      existingItems,
      forceRefresh,
    )

    const processedItems = await this.processAndSaveNewItems(
      brandNewItems,
      true,
      forceRefresh,
    )
    await this.linkExistingItems(existingItemsToLink)

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

    return this.buildResponse(
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

    const { allKeys, userKeyMap } =
      this.extractKeysAndRelationships(userWatchlistMap)
    const existingItems = await this.getExistingItems(userKeyMap, allKeys)
    const { brandNewItems, existingItemsToLink } = this.categorizeItems(
      userWatchlistMap,
      existingItems,
      forceRefresh,
    )

    const processedItems = await this.processAndSaveNewItems(
      brandNewItems,
      false,
      forceRefresh,
    )
    await this.linkExistingItems(existingItemsToLink)

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

    return this.buildResponse(
      userWatchlistMap,
      existingItems,
      existingItemsToLink,
      processedItems,
    )
  }

  /**
   * Ensures users exist for each Plex token in the configuration
   *
   * Fetches the actual username from the Plex API for each token,
   * creates new users if needed, and updates existing users.
   * The first token is marked as the primary token user.
   *
   * @returns Promise resolving to a map of Plex usernames to user IDs
   */
  private async ensureTokenUsers(): Promise<Map<string, number>> {
    const userMap = new Map<string, number>()
    await Promise.all(
      this.config.plexTokens.map(async (token, index) => {
        // Fetch the actual Plex username for this token
        let plexUsername = `token${index + 1}` // Fallback name
        const isPrimary = index === 0 // First token is primary

        // Create AbortController for timeout
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10_000) // 10s timeout

        try {
          // Fetch the actual username from Plex API with timeout handling
          const response = await fetch('https://plex.tv/api/v2/user', {
            headers: {
              'X-Plex-Token': token,
              Accept: 'application/json',
            },
            signal: controller.signal,
          })

          if (response.ok) {
            const userData = (await response.json()) as { username: string }
            if (userData?.username) {
              plexUsername = userData.username
              this.log.debug(
                `Using actual Plex username: ${plexUsername} for token${index + 1}`,
              )
            }
          }
        } catch (error) {
          // Handle timeout errors specifically
          if (error instanceof Error && error.name === 'AbortError') {
            this.log.warn(
              `Timeout fetching Plex username for token${index + 1} after 10s, using fallback name`,
            )
          } else {
            this.log.error(
              { error, tokenIndex: index + 1 },
              'Failed to fetch Plex username for token',
            )
          }
          // Continue with the fallback name
        } finally {
          // Always clear the timeout to prevent memory leaks
          clearTimeout(timeoutId)
        }

        // Variable to hold our user
        let user: User | undefined

        // If this is the primary token, try to get the existing primary user
        if (isPrimary) {
          user = await this.dbService.getPrimaryUser()
        }

        if (!user) {
          // Check if a user with this name already exists
          user = await this.dbService.getUser(plexUsername)
        }

        if (user) {
          // Update existing user if needed
          if (
            user.is_primary_token !== isPrimary ||
            user.name !== plexUsername
          ) {
            // If this user should be primary, update primary status first
            if (isPrimary && !user.is_primary_token) {
              // Use the database service method to set primary user
              await this.dbService.setPrimaryUser(user.id)
            }

            // Update other user details if needed
            await this.dbService.updateUser(user.id, {
              name: plexUsername,
              is_primary_token: isPrimary,
            })

            // Reload the user to get updated data
            user = await this.dbService.getUser(plexUsername)
          }
        } else {
          // If we're creating a primary user, ensure no other primaries exist
          if (isPrimary) {
            // Use the database service method to handle primary user setting
            // We'll create the user first, then set it as primary
            user = await this.dbService.createUser({
              name: plexUsername,
              apprise: null,
              alias: null,
              discord_id: null,
              notify_apprise: false,
              notify_discord: false,
              notify_tautulli: false,
              tautulli_notifier_id: null,
              can_sync: this.config.newUserDefaultCanSync ?? true,
              requires_approval:
                this.config.newUserDefaultRequiresApproval ?? false,
              is_primary_token: false, // Initially false, will set to true next
            })

            // Now set as primary using the database service method
            await this.dbService.setPrimaryUser(user.id)

            // Create default quotas for the new user
            await this.createDefaultQuotasForUser(user.id)

            // Reload to get updated data
            user = await this.dbService.getUser(user.id)
          } else {
            // Create regular non-primary user
            user = await this.dbService.createUser({
              name: plexUsername,
              apprise: null,
              alias: null,
              discord_id: null,
              notify_apprise: false,
              notify_discord: false,
              notify_tautulli: false,
              tautulli_notifier_id: null,
              can_sync: this.config.newUserDefaultCanSync ?? true,
              requires_approval:
                this.config.newUserDefaultRequiresApproval ?? false,
              is_primary_token: false,
            })

            // Create default quotas for the new user
            await this.createDefaultQuotasForUser(user.id)
          }
        }

        // Safety check for user ID
        if (!user || typeof user.id !== 'number') {
          throw new Error(`Failed to create or retrieve user ${plexUsername}`)
        }

        userMap.set(plexUsername, user.id)
        this.log.debug(`Mapped user ${plexUsername} to ID ${user.id}`)
      }),
    )

    this.log.debug(`Ensured users for ${this.config.plexTokens.length} tokens`)
    return userMap
  }

  private async ensureFriendUsers(
    friends: Set<[Friend, string]>,
  ): Promise<{ userMap: Map<string, number>; added: EtagUserInfo[] }> {
    const userMap = new Map<string, number>()
    const added: EtagUserInfo[] = []

    await Promise.all(
      Array.from(friends).map(async ([friend]) => {
        let user = await this.dbService.getUser(friend.username)
        const isNewUser = !user

        if (!user) {
          user = await this.dbService.createUser({
            name: friend.username,
            apprise: null,
            alias: null,
            discord_id: null,
            notify_apprise: false,
            notify_discord: false,
            notify_tautulli: false,
            tautulli_notifier_id: null,
            can_sync: this.config.newUserDefaultCanSync ?? true,
            requires_approval:
              this.config.newUserDefaultRequiresApproval ?? false,
            is_primary_token: false,
          })

          // Create default quotas for the new user
          await this.createDefaultQuotasForUser(user.id)
        }

        if (!user.id) throw new Error(`No ID for user ${friend.username}`)
        userMap.set(friend.watchlistId, user.id)

        // Track newly added users for ETag baseline establishment
        if (isNewUser) {
          added.push({
            userId: user.id,
            username: friend.username,
            watchlistId: friend.watchlistId,
            isPrimary: false,
          })
        }
      }),
    )

    return { userMap, added }
  }

  private extractKeysAndRelationships(
    userWatchlistMap: Map<Friend, Set<TokenWatchlistItem>>,
  ) {
    const allKeys = new Set<string>()
    const userKeyMap = new Map<string, Set<string>>()

    for (const [user, items] of userWatchlistMap) {
      const userId = String(user.userId)
      const userKeys = new Set<string>()

      for (const item of items) {
        if (item.id) {
          allKeys.add(item.id)
          userKeys.add(item.id)
        } else {
          this.log.warn(
            `Encountered item with null/undefined id for user ${userId}`,
          )
        }
      }

      if (userKeys.size > 0) {
        userKeyMap.set(userId, userKeys)
      }
    }

    this.log.debug(
      { userIds: Array.from(userKeyMap.keys()) },
      `Collected ${userKeyMap.size} users and ${allKeys.size} unique keys`,
    )
    return { allKeys, userKeyMap }
  }

  private async getExistingItems(
    userKeyMap: Map<string, Set<string>>,
    allKeys: Set<string>,
  ): Promise<WatchlistItem[]> {
    const keys = Array.from(allKeys)
    const userIds = Array.from(userKeyMap.keys())
      .map(Number)
      .filter((id) => !Number.isNaN(id))

    this.log.debug(
      {
        userIds,
        keySample: keys.slice(0, 5),
      },
      `Looking up existing items with ${userIds.length} users and ${keys.length} unique keys`,
    )

    const allItemsByKey = await this.dbService.getWatchlistItemsByKeys(keys)

    this.log.debug(
      `Found ${allItemsByKey.length} existing items by keys in database`,
    )

    const userSpecificItems = await this.dbService.getBulkWatchlistItems(
      userIds,
      keys,
    )

    this.log.debug(
      `Found ${userSpecificItems.length} user-specific items in database`,
    )

    const combinedItems = [...allItemsByKey, ...userSpecificItems]
    const uniqueItems = new Map<string, WatchlistItem>()

    for (const item of combinedItems) {
      if (!item.key || !item.user_id) continue

      const uniqueId = `${item.key}:${item.user_id}`
      if (!uniqueItems.has(uniqueId)) {
        uniqueItems.set(uniqueId, item)
      }
    }

    const existingItems = Array.from(uniqueItems.values())

    this.log.debug(
      `Found ${existingItems.length} unique existing items for processing`,
    )

    return existingItems
  }

  private categorizeItems(
    userWatchlistMap: Map<Friend, Set<TokenWatchlistItem>>,
    existingItems: WatchlistItem[],
    forceRefresh = false,
  ) {
    const brandNewItems = new Map<Friend, Set<TokenWatchlistItem>>()
    const existingItemsToLink = new Map<Friend, Set<WatchlistItem>>()

    if (forceRefresh) {
      // When force refresh is enabled, treat all items as brand new to trigger metadata re-fetching
      this.log.debug(
        'Force refresh enabled - treating all items as new for metadata refresh',
      )
      userWatchlistMap.forEach((items, user) => {
        brandNewItems.set(user, items)
      })
    } else {
      // Normal categorization logic
      const existingItemsByKey = this.mapExistingItemsByKey(existingItems)

      userWatchlistMap.forEach((items, user) => {
        const { newItems, itemsToLink } = this.separateNewAndExistingItems(
          items,
          user,
          existingItemsByKey,
        )

        if (newItems.size > 0) brandNewItems.set(user, newItems)
        if (itemsToLink.size > 0) existingItemsToLink.set(user, itemsToLink)
      })
    }

    return { brandNewItems, existingItemsToLink }
  }

  private async processAndSaveNewItems(
    brandNewItems: Map<Friend, Set<TokenWatchlistItem>>,
    isSelfWatchlist = false,
    isMetadataRefresh = false,
  ): Promise<Map<Friend, Set<WatchlistItem>>> {
    if (brandNewItems.size === 0) {
      return new Map<Friend, Set<WatchlistItem>>()
    }

    this.log.debug(`Processing ${brandNewItems.size} new items`)

    const operationId = `process-${Date.now()}`
    const emitProgress = this.fastify.progress.hasActiveConnections()

    // Use the passed parameter to determine the type
    const type = isSelfWatchlist ? 'self-watchlist' : 'others-watchlist'

    if (emitProgress) {
      this.fastify.progress.emit({
        operationId,
        type,
        phase: 'start',
        progress: 0,
        message: `Starting ${isSelfWatchlist ? 'self' : 'others'} watchlist processing`,
      })
    }

    const processedItems = await processWatchlistItems(
      this.config,
      this.log,
      brandNewItems,
      emitProgress
        ? {
            progress: this.fastify.progress,
            operationId,
            type,
          }
        : undefined,
    )

    if (processedItems instanceof Map) {
      const itemsToInsert = await this.prepareItemsForInsertion(processedItems)

      if (itemsToInsert.length > 0) {
        if (emitProgress) {
          this.fastify.progress.emit({
            operationId,
            type,
            phase: 'saving',
            progress: 95,
            message: `Saving ${itemsToInsert.length} items to database`,
          })
        }

        const insertedResults = await this.dbService.createWatchlistItems(
          itemsToInsert,
          isMetadataRefresh
            ? { onConflict: 'merge' }
            : { onConflict: 'ignore' },
        )
        await this.dbService.syncGenresFromWatchlist()

        // Queue newly inserted items for immediate Plex labeling if enabled
        if (
          this.plexLabelSyncService &&
          this.config.plexLabelSync?.enabled &&
          insertedResults &&
          insertedResults.length > 0
        ) {
          try {
            this.log.debug(
              `Syncing immediate Plex labeling with tag fetching for ${insertedResults.length} newly added items`,
            )

            // Create a map of key -> item for efficient lookup
            const itemMap = new Map(
              itemsToInsert.map((item) => [item.key, item]),
            )

            // Process inserted items with bounded concurrency to avoid overwhelming *arr services
            const concurrencyLimit =
              this.config.plexLabelSync?.concurrencyLimit || 5
            const limit = pLimit(concurrencyLimit)

            const syncResults = await Promise.allSettled(
              insertedResults.map(({ id, key }) =>
                limit(async () => {
                  const originalItem = itemMap.get(key)
                  if (!originalItem || !this.plexLabelSyncService) {
                    return false
                  }

                  return await this.plexLabelSyncService.syncLabelForNewWatchlistItem(
                    id,
                    originalItem.title,
                    true, // Enable tag fetching
                  )
                }),
              ),
            )

            // Log any failures
            const failed = syncResults
              .filter((result) => result.status === 'rejected')
              .map((result) => (result as PromiseRejectedResult).reason)

            if (failed.length > 0) {
              this.log.warn(
                {
                  failures: failed,
                },
                `${failed.length} of ${insertedResults.length} Plex label sync operations failed`,
              )
            }
          } catch (error) {
            this.log.warn(
              { error },
              'Failed to sync immediate Plex labeling for newly inserted items',
            )
          }
        }

        this.log.debug(`Processed ${itemsToInsert.length} new items`)

        // REMOVED: Old notification behavior that sent "Added by X" notifications
        //          regardless of whether content was actually routed.
        // New behavior: Notifications only sent after successful routing:
        //   - RSS immediate: Checked via pendingItem.routed flag in processRssPendingItems()
        //   - Reconciliation: Sent directly from processShowWithRouting()/processMovieWithRouting()

        if (emitProgress) {
          this.fastify.progress.emit({
            operationId,
            type,
            phase: 'complete',
            progress: 100,
            message: 'All items processed and saved',
          })
        }
      }

      return processedItems
    }

    throw new Error(
      'Expected Map<Friend, Set<WatchlistItem>> from processWatchlistItems',
    )
  }

  // Old behavior: Sent "Added by X" notifications as soon as items were detected,
  //               regardless of routing outcome or existing content status.
  // New behavior: Notifications only sent when content is actually routed:
  //   - RSS immediate path: Checked via pendingItem.routed flag in processRssPendingItems()
  //   - Reconciliation path: Sent directly from processShowWithRouting()/processMovieWithRouting()
  //     when routedInstances.length > 0
  // This function was removed as part of the route-only notifications refactor.

  private async linkExistingItems(
    existingItemsToLink: Map<Friend, Set<WatchlistItem>>,
  ): Promise<void> {
    if (existingItemsToLink.size === 0) {
      this.log.debug('No existing items to link')
      return
    }

    const linkItems: WatchlistItem[] = []
    const userCounts: Record<string, number> = {}

    for (const [user, items] of existingItemsToLink.entries()) {
      const itemArray = Array.from(items)
      linkItems.push(...itemArray)
      userCounts[user.username] = itemArray.length
    }

    if (linkItems.length === 0) {
      this.log.debug('No items to link after filtering')
      return
    }

    this.log.debug(
      `Linking ${linkItems.length} existing items to ${existingItemsToLink.size} users`,
    )

    this.log.debug(
      {
        userCounts,
        sample: linkItems.slice(0, 3).map((item) => ({
          title: item.title,
          key: item.key,
          userId: item.user_id,
        })),
      },
      'Linking details:',
    )

    try {
      await this.dbService.createWatchlistItems(linkItems, {
        onConflict: 'merge',
      })

      await this.dbService.syncGenresFromWatchlist()

      this.log.debug(
        `Successfully linked ${linkItems.length} existing items to new users`,
      )

      // Queue re-added items for label synchronization
      await this.handleLinkedItemsForLabelSync(linkItems)
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      this.log.error({ error: err }, 'Error linking existing items')
      throw error
    }
  }

  private buildResponse(
    userWatchlistMap: Map<Friend, Set<TokenWatchlistItem>>,
    existingItems: WatchlistItem[],
    existingItemsToLink: Map<Friend, Set<WatchlistItem>>,
    processedItems: Map<Friend, Set<WatchlistItem>>,
  ) {
    return {
      total: this.calculateTotal(
        existingItems,
        existingItemsToLink,
        processedItems,
      ),
      users: this.buildUserWatchlists(
        userWatchlistMap,
        existingItems,
        existingItemsToLink,
        processedItems,
      ),
    }
  }

  private mapExistingItemsByKey(existingItems: WatchlistItem[]) {
    this.log.debug(`Mapping ${existingItems.length} existing items by key`)

    const map = new Map<string, Map<number, WatchlistItem>>()
    let skippedCount = 0

    for (const item of existingItems) {
      if (!item.key || !item.user_id) {
        skippedCount++
        continue
      }

      let userMap = map.get(item.key)
      if (!userMap) {
        userMap = new Map<number, WatchlistItem>()
        map.set(item.key, userMap)
      }

      userMap.set(item.user_id, item)
    }

    this.log.debug(
      {
        totalItems: existingItems.length,
        skippedItems: skippedCount,
        uniqueKeys: map.size,
      },
      `Created key map with ${map.size} unique keys`,
    )

    return map
  }

  private separateNewAndExistingItems(
    items: Set<TokenWatchlistItem>,
    user: Friend & { userId: number },
    existingItemsByKey: Map<string, Map<number, WatchlistItem>>,
  ) {
    const newItems = new Set<TokenWatchlistItem>()
    const itemsToLink = new Set<WatchlistItem>()

    let newItemsCount = 0
    let existingItemsCount = 0
    let alreadyLinkedCount = 0
    let toBeLinkedCount = 0

    this.log.debug(
      `Separating ${items.size} items for user ${user.username} (ID: ${user.userId})`,
    )

    for (const item of items) {
      const lookupKey = item.key || item.id

      if (!lookupKey) {
        this.log.warn(
          {
            title: item.title,
          },
          `Item missing key/id for user ${user.username}`,
        )
        continue
      }

      const existingItemMap = existingItemsByKey.get(lookupKey)

      if (!existingItemMap) {
        newItems.add(item)
        newItemsCount++
      } else {
        existingItemsCount++

        if (existingItemMap.has(user.userId)) {
          alreadyLinkedCount++
        } else {
          const templateItem = existingItemMap.values().next().value

          if (templateItem?.title && templateItem?.type) {
            itemsToLink.add(this.createWatchlistItem(user, item, templateItem))
            toBeLinkedCount++
          } else {
            this.log.warn(
              {
                hasTitle: !!templateItem?.title,
                hasType: !!templateItem?.type,
              },
              `Invalid template item for ${lookupKey}`,
            )
            newItems.add(item)
            newItemsCount++
          }
        }
      }
    }

    this.log.debug(
      `Processed ${items.size} items for user ${user.username}: ${newItemsCount} new, ${toBeLinkedCount} to link`,
    )

    this.log.debug(
      {
        total: items.size,
        newItems: newItemsCount,
        existingInDb: existingItemsCount,
        alreadyLinked: alreadyLinkedCount,
        toBeLinked: toBeLinkedCount,
      },
      `Detailed separation results for ${user.username}:`,
    )

    return { newItems, itemsToLink }
  }

  private createWatchlistItem(
    user: Friend & { userId: number },
    item: TokenWatchlistItem,
    templateItem: WatchlistItem,
  ): WatchlistItem {
    return {
      user_id: user.userId,
      title: templateItem.title,
      key: item.id,
      type: templateItem.type,
      thumb: templateItem.thumb,
      guids: parseGuids(templateItem.guids),
      genres: templateItem.genres || [],
      status: 'pending' as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  }

  private async prepareItemsForInsertion(
    processedItems: Map<Friend & { userId: number }, Set<WatchlistItem>>,
  ) {
    // Get all user IDs from the processedItems
    const userIds = Array.from(processedItems.keys()).map((user) => user.userId)

    // Fetch all users in one batch to get their sync permissions
    const users = await Promise.all(
      userIds.map((id) => {
        // Ensure we're always passing a simple number, not an object
        const numericId =
          typeof id === 'object' && id !== null
            ? 'id' in id
              ? (id as { id: number }).id
              : Number(id)
            : Number(id)
        return this.dbService.getUser(numericId)
      }),
    )

    // Create a map of user ID to their can_sync permission
    const userSyncPermissions = new Map<number, boolean>()
    users.forEach((user, index) => {
      if (user) {
        userSyncPermissions.set(userIds[index], user.can_sync)
      }
    })

    return Array.from(processedItems.entries()).flatMap(([user, items]) => {
      // Make sure we have a numeric user ID
      const numericUserId =
        typeof user.userId === 'object' && user.userId !== null
          ? 'id' in user.userId
            ? (user.userId as { id: number }).id
            : Number(user.userId)
          : Number(user.userId)

      // During initial sync, assume syncing is enabled if user not found
      const canSync = userSyncPermissions.get(numericUserId) !== false

      if (!canSync) {
        this.log.debug(
          `Skipping ${items.size} items for user ${user.username} (ID: ${numericUserId}) who has sync disabled`,
        )
        return []
      }

      return Array.from(items).map((item) => ({
        user_id: numericUserId,
        title: item.title,
        key: item.key,
        thumb: item.thumb,
        type: item.type,
        guids: parseGuids(item.guids),
        genres: item.genres || [],
        status: 'pending' as const,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }))
    })
  }

  private calculateTotal(
    existingItems: WatchlistItem[],
    existingItemsToLink: Map<Friend, Set<WatchlistItem>>,
    processedItems: Map<Friend, Set<WatchlistItem>>,
  ) {
    const linkItemsCount = Array.from(existingItemsToLink.values()).reduce(
      (acc, items) => acc + items.size,
      0,
    )
    const processedItemsCount = Array.from(processedItems.values()).reduce(
      (acc, items) => acc + items.size,
      0,
    )
    return existingItems.length + linkItemsCount + processedItemsCount
  }

  private buildUserWatchlists(
    userWatchlistMap: Map<Friend & { userId: number }, Set<TokenWatchlistItem>>,
    existingItems: WatchlistItem[],
    existingItemsToLink: Map<Friend & { userId: number }, Set<WatchlistItem>>,
    processedItems: Map<Friend & { userId: number }, Set<WatchlistItem>>,
  ) {
    return Array.from(userWatchlistMap.keys()).map((user) => ({
      user: {
        watchlistId: user.watchlistId,
        username: user.username,
        userId: user.userId,
      },
      watchlist: [
        ...this.formatExistingItems(existingItems, user),
        ...this.formatLinkedItems(existingItemsToLink, user),
        ...this.formatProcessedItems(processedItems, user),
      ],
    }))
  }

  private formatExistingItems(
    existingItems: WatchlistItem[],
    user: Friend & { userId: number },
  ) {
    return existingItems
      .filter((item) => item.user_id === user.userId)
      .map((item) => this.formatWatchlistItem(item))
  }

  private formatLinkedItems(
    existingItemsToLink: Map<Friend & { userId: number }, Set<WatchlistItem>>,
    user: Friend & { userId: number },
  ) {
    return existingItemsToLink.has(user)
      ? Array.from(existingItemsToLink.get(user) as Set<WatchlistItem>).map(
          (item) => this.formatWatchlistItem(item),
        )
      : []
  }

  private formatProcessedItems(
    processedItems: Map<Friend & { userId: number }, Set<WatchlistItem>>,
    user: Friend & { userId: number },
  ) {
    return processedItems.has(user)
      ? Array.from(processedItems.get(user) as Set<WatchlistItem>).map((item) =>
          this.formatWatchlistItem(item),
        )
      : []
  }

  private formatWatchlistItem(item: WatchlistItem) {
    return {
      title: item.title,
      plexKey: item.key,
      type: item.type,
      thumb: item.thumb || '',
      guids: parseGuids(item.guids),
      genres: parseGenres(item.genres),
      status: 'pending' as const,
    }
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

  private mapRssItemsToWatchlist(items: Set<TemptRssWatchlistItem>) {
    return Array.from(items).map((item) => ({
      title: item.title,
      plexKey: item.key,
      type: item.type,
      thumb: item.thumb || '',
      guids: parseGuids(item.guids),
      genres: parseGenres(item.genres),
      status: 'pending' as const,
    }))
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
   * Checks for and removes users (friends) who are no longer in the current friends list.
   *
   * This method compares all existing users in the database (excluding the primary token user)
   * with the current friends list from Plex. Any users not found in the current friends list
   * are deleted from the database, which will cascade delete their watchlist items.
   *
   * @param currentFriends - Set of current friends from Plex API
   */
  private async checkForRemovedFriends(
    currentFriends: Set<[Friend, string]>,
  ): Promise<EtagUserInfo[]> {
    const removed: EtagUserInfo[] = []

    try {
      // Get all users from database
      const allUsers = await this.dbService.getAllUsers()

      // Get the primary user to exclude from cleanup
      const primaryUser = await this.dbService.getPrimaryUser()

      // Create a set of current friend usernames for O(1) lookup (case-insensitive)
      const currentFriendUsernames = new Set(
        Array.from(currentFriends).map(([friend]) =>
          friend.username.toLowerCase(),
        ),
      )

      // Find users who are no longer friends (excluding primary user)
      const usersToDelete = allUsers.filter((user) => {
        // Never delete the primary user
        if (primaryUser && user.id === primaryUser.id) {
          return false
        }

        // Delete users who are not in the current friends list (case-insensitive comparison)
        return !currentFriendUsernames.has(user.name.toLowerCase())
      })

      if (usersToDelete.length > 0) {
        this.log.info(
          `Found ${usersToDelete.length} users who are no longer friends, removing them from database`,
        )

        // Delete users (this will cascade delete their watchlist items)
        const userIds = usersToDelete.map((user) => user.id)
        const result = await this.dbService.deleteUsers(userIds)

        this.log.info(
          `Successfully removed ${result.deletedCount} former friends from database`,
        )

        // Log details of removed users for transparency
        const successfullyDeleted = usersToDelete.filter(
          (user) => !result.failedIds.includes(user.id),
        )

        for (const user of successfullyDeleted) {
          this.log.debug(`Removed former friend: ${user.name} (ID: ${user.id})`)
          // Track removed users for ETag cache invalidation
          removed.push({
            userId: user.id,
            username: user.name,
            isPrimary: false,
          })
        }

        // Log any failures
        if (result.failedIds.length > 0) {
          const failedUsers = usersToDelete.filter((user) =>
            result.failedIds.includes(user.id),
          )
          this.log.warn(
            `Failed to remove ${result.failedIds.length} former friends: ${failedUsers.map((u) => u.name).join(', ')}`,
          )
        }
      } else {
        this.log.debug('No removed friends detected, database is up to date')
      }
    } catch (error) {
      this.log.error(
        { error },
        'Error checking for and removing former friends:',
      )
      // Don't throw - this is cleanup logic and shouldn't break the main flow
    }

    return removed
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
    this.userCanSyncCache.clear()

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
