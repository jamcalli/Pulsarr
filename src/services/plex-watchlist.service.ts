import type { FastifyBaseLogger } from 'fastify'
import type { FastifyInstance } from 'fastify'
import {
  getOthersWatchlist,
  processWatchlistItems,
  getFriends,
  pingPlex,
  fetchSelfWatchlist,
  getPlexWatchlistUrls,
  fetchWatchlistFromRss,
} from '@utils/plex.js'
import {
  parseGuids,
  hasMatchingGuids,
  hasMatchingParsedGuids,
} from '@utils/guid-handler.js'
import type {
  Item as WatchlistItem,
  TokenWatchlistItem,
  Friend,
  RssWatchlistResults,
  WatchlistGroup,
  TemptRssWatchlistItem,
} from '@root/types/plex.types.js'
import type { User } from '@root/types/config.types.js'
import type { RssFeedsResponse } from '@schemas/plex/generate-rss-feeds.schema.js'

export class PlexWatchlistService {
  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
    private readonly dbService: FastifyInstance['db'],
  ) {}

  private get config() {
    return this.fastify.config
  }

  /**
   * Creates a snapshot of existing GUIDs for a specific operation
   *
   * @returns Promise resolving to a Set of lowercase GUIDs
   */
  private async createGuidsSnapshot(): Promise<Set<string>> {
    try {
      // Use the optimized database method
      const guids = await this.dbService.getAllGuidsMapped()

      // Convert array to Set for O(1) lookups
      const snapshot = new Set<string>()
      for (const guid of guids) {
        snapshot.add(guid.toLowerCase())
      }

      this.log.debug(
        `Created GUIDs snapshot with ${snapshot.size} unique GUIDs`,
      )
      return snapshot
    } catch (error) {
      this.log.error('Error creating GUIDs snapshot:', error)
      return new Set()
    }
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
   * Determines if a notification should be sent
   *
   * @param title - Item title
   * @param existingNotifications - Set of existing notification titles
   * @param guids - Item GUIDs
   * @param existingGuidsSnapshot - Snapshot of GUIDs that existed before sync
   * @returns Boolean indicating if notification should be sent
   */
  private shouldSendNotification(
    title: string,
    existingNotifications: Set<string>,
    guids: string[],
    existingGuidsSnapshot: Set<string>,
  ): boolean {
    // Check if notification already exists
    if (existingNotifications.has(title)) {
      this.log.info(
        `Skipping notification for "${title}" - already sent previously`,
      )
      return false
    }

    // Check if any GUIDs existed before sync
    for (const guid of guids) {
      const normalizedGuid = guid.toLowerCase()
      if (existingGuidsSnapshot.has(normalizedGuid)) {
        this.log.info(
          `Skipping notification for "${title}" - item with GUID ${guid} already existed before sync`,
          { title, guid },
        )
        return false
      }
    }

    return true
  }

  /**
   * Sends watchlist notifications to a user
   *
   * @param user - User to notify
   * @param item - Watchlist item details
   * @returns Promise resolving to boolean indicating if any notifications were sent
   */
  private async sendWatchlistNotifications(
    user: Friend, // Change parameter type to Friend
    item: {
      id?: number | string
      title: string
      type: string
      thumb?: string
    },
  ): Promise<boolean> {
    const username = user.username || 'Unknown User'
    let discordSent = false
    let appriseSent = false

    // Send Discord notification (simplified without discord_id check)
    try {
      discordSent = await this.fastify.discord.sendMediaNotification({
        username,
        title: item.title,
        type: item.type as 'movie' | 'show',
        posterUrl: item.thumb,
      })

      this.log.info(
        `Notified Discord admin endpoints that ${username} added "${item.title}"`,
        { success: discordSent },
      )
    } catch (error) {
      this.log.error('Error sending Discord webhook notification:', error)
    }

    // Send Apprise notification
    if (this.fastify.apprise?.isEnabled()) {
      try {
        appriseSent =
          await this.fastify.apprise.sendWatchlistAdditionNotification({
            title: item.title,
            type: typeof item.type === 'string' ? item.type : 'unknown',
            addedBy: {
              name: username,
            },
            posterUrl: item.thumb,
          })

        this.log.info(
          `Notified Apprise admin endpoints that ${username} added "${item.title}"`,
          { success: appriseSent },
        )
      } catch (error) {
        this.log.error('Error sending Apprise notification:', error)
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
      tokens.map((token, index) => {
        return pingPlex(token, this.log)
      }),
    )

    return results.every((result) => result === true)
  }

  async getSelfWatchlist() {
    if (this.config.plexTokens.length === 0) {
      throw new Error('No Plex token configured')
    }

    // Create a snapshot for this specific operation
    const existingGuidsSnapshot = await this.createGuidsSnapshot()

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

    // Fetch items with the primary user ID
    const items = await fetchSelfWatchlist(
      tokenConfig,
      this.log,
      primaryUser.id,
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
      this.log.info('No items in self watchlist, returning empty result')
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
    )

    const processedItems = await this.processAndSaveNewItems(
      brandNewItems,
      true,
      existingGuidsSnapshot,
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
      existingGuidsSnapshot,
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
    await this.dbService.updateConfig(dbUrls)
    this.log.info('RSS feed URLs saved to database', dbUrls)

    return {
      self: dbUrls.selfRss,
      friends: dbUrls.friendsRss,
    }
  }

  async getOthersWatchlists() {
    if (this.config.plexTokens.length === 0) {
      throw new Error('No Plex token configured')
    }

    // Create a snapshot for this specific operation
    const existingGuidsSnapshot = await this.createGuidsSnapshot()

    const friends = await getFriends(this.config, this.log)

    // Early check for no friends
    if (friends.size === 0) {
      this.log.info('You do not appear to have any friends... 😢')
      return {
        total: 0,
        users: [],
      }
    }

    const userMap = await this.ensureFriendUsers(friends)

    const friendsWithIds = new Set(
      Array.from(friends)
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
    )

    const processedItems = await this.processAndSaveNewItems(
      brandNewItems,
      false,
      existingGuidsSnapshot,
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
      existingGuidsSnapshot,
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
              `Failed to fetch Plex username for token${index + 1}:`,
              error,
            )
          }
          // Continue with the fallback name
        } finally {
          // Always clear the timeout to prevent memory leaks
          clearTimeout(timeoutId)
        }

        // Variable to hold our user
        let user: User | undefined = undefined

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
              requires_approval: false,
              is_primary_token: false, // Initially false, will set to true next
            })

            // Now set as primary using the database service method
            await this.dbService.setPrimaryUser(user.id)

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
              requires_approval: false,
              is_primary_token: false,
            })
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

    this.log.info(`Ensured users for ${this.config.plexTokens.length} tokens`)
    return userMap
  }

  private async ensureFriendUsers(
    friends: Set<[Friend, string]>,
  ): Promise<Map<string, number>> {
    const userMap = new Map<string, number>()

    await Promise.all(
      Array.from(friends).map(async ([friend]) => {
        let user = await this.dbService.getUser(friend.username)

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
            is_primary_token: false,
          })
        }

        if (!user.id) throw new Error(`No ID for user ${friend.username}`)
        userMap.set(friend.watchlistId, user.id)
      }),
    )

    return userMap
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

    this.log.info(
      `Collected ${userKeyMap.size} users and ${allKeys.size} unique keys`,
      { userIds: Array.from(userKeyMap.keys()) },
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
      `Looking up existing items with ${userIds.length} users and ${keys.length} unique keys`,
      {
        userIds,
        keySample: keys.slice(0, 5),
      },
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

    this.log.info(
      `Found ${existingItems.length} unique existing items for processing`,
    )

    return existingItems
  }

  private categorizeItems(
    userWatchlistMap: Map<Friend, Set<TokenWatchlistItem>>,
    existingItems: WatchlistItem[],
  ) {
    const brandNewItems = new Map<Friend, Set<TokenWatchlistItem>>()
    const existingItemsToLink = new Map<Friend, Set<WatchlistItem>>()
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

    return { brandNewItems, existingItemsToLink }
  }

  private async processAndSaveNewItems(
    brandNewItems: Map<Friend, Set<TokenWatchlistItem>>,
    isSelfWatchlist = false,
    existingGuidsSnapshot?: Set<string>,
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

        await this.dbService.createWatchlistItems(itemsToInsert)
        await this.dbService.syncGenresFromWatchlist()

        this.log.info(`Processed ${itemsToInsert.length} new items`)

        // Send notifications directly if we have a GUID snapshot
        // This handles the interval-based sync case (not RSS)
        if (existingGuidsSnapshot) {
          await this.sendNotificationsForNewItems(
            processedItems,
            existingGuidsSnapshot,
          )
        }

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

  /**
   * Checks if the RSS workflow is fully initialized and actively running
   *
   * @returns boolean indicating if RSS workflow is active and fully initialized
   */
  private isRssWorkflowActive(): boolean {
    try {
      // Check if the workflow service exists
      if (!this.fastify.watchlistWorkflow) {
        this.log.debug('Watchlist workflow service not found')
        return false
      }

      // Check if the workflow is fully initialized and in RSS mode
      const isInitialized =
        this.fastify.watchlistWorkflow.isInitialized() === true
      const isRssMode = this.fastify.watchlistWorkflow.isRssMode() === true
      const isActive = isInitialized && isRssMode

      if (isActive) {
        this.log.debug('RSS workflow is active and fully initialized')
      } else {
        this.log.debug(
          `RSS workflow is not yet active or fully initialized (initialized: ${isInitialized}, rssMode: ${isRssMode})`,
        )
      }

      return isActive
    } catch (error) {
      this.log.error('Error checking RSS workflow status:', error)
      return false
    }
  }

  /**
   * Sends notifications for newly added items during full sync
   *
   * Note: This method will send notifications during application startup or initial sync
   * even when in RSS mode. Once the RSS workflow is fully initialized and active,
   * notifications for new items will be handled by that process instead.
   *
   * @param processedItems - Map of users to their newly processed watchlist items
   * @param existingGuidsSnapshot - Snapshot of GUIDs that existed before sync
   */
  private async sendNotificationsForNewItems(
    processedItems: Map<Friend, Set<WatchlistItem>>,
    existingGuidsSnapshot: Set<string>,
  ): Promise<void> {
    // Skip notification only if RSS workflow is fully initialized and active
    // During startup/initial sync, we still send notifications even in RSS mode
    if (this.isRssWorkflowActive()) {
      this.log.info(
        'Skipping direct notifications because RSS workflow is fully initialized and active',
      )
      return
    }

    const guidCache = new Map<string, string[]>()
    let notificationsSent = 0

    // Get notification cache for each user-title combination
    const notificationChecks = new Map<number, Map<string, boolean>>()

    this.log.info(
      `Checking ${processedItems.size} users for potential notifications of new items`,
    )

    // Pre-process titles for each user to check existing notifications
    const userItemTitles = new Map<number, string[]>()
    for (const [user, items] of processedItems.entries()) {
      if (!user.userId) continue

      const titles: string[] = []
      for (const item of items) {
        if (item.title) titles.push(item.title)
      }

      if (titles.length > 0) {
        userItemTitles.set(user.userId, titles)
      }
    }

    // Fetch all notification checks in one batch per user
    await Promise.all(
      Array.from(userItemTitles.entries()).map(async ([userId, titles]) => {
        try {
          const checks = await this.dbService.checkExistingWebhooks(
            userId,
            titles,
          )
          notificationChecks.set(userId, checks)
        } catch (error) {
          this.log.error(
            `Error checking existing notifications for user ${userId}:`,
            error,
          )
          // Create an empty map for this user to avoid crashes
          notificationChecks.set(userId, new Map())
        }
      }),
    )

    // Now process all items with the cached notification checks
    for (const [user, items] of processedItems.entries()) {
      if (!user.userId) continue

      const userNotifications =
        notificationChecks.get(user.userId) || new Map<string, boolean>()

      for (const item of items) {
        // Skip items without titles or types
        if (!item.title || !item.type) continue

        // Get and normalize GUIDs for this item
        const itemGuids = this.getParsedGuids(guidCache, item.guids || [])

        // Check if this item already has a notification
        const hasExistingNotification =
          userNotifications.get(item.title) === true

        if (hasExistingNotification) {
          this.log.info(
            `Skipping notification for "${item.title}" - already sent previously to user ID ${user.userId}`,
          )
          continue
        }

        // Check if any GUIDs existed before sync
        let existedBeforeSync = false
        for (const guid of itemGuids) {
          const normalizedGuid = guid.toLowerCase()
          if (existingGuidsSnapshot.has(normalizedGuid)) {
            this.log.info(
              `Skipping notification for "${item.title}" - item with GUID ${guid} already existed before sync`,
              { title: item.title, guid },
            )
            existedBeforeSync = true
            break
          }
        }

        if (!existedBeforeSync) {
          // Send notification for this item
          // Note: The processedItems contains WatchlistItem objects from the API
          // which use 'plexKey' instead of 'key'
          // Convert plexKey to string or number if present, otherwise undefined
          const itemId =
            'plexKey' in item
              ? typeof item.plexKey === 'string' ||
                typeof item.plexKey === 'number'
                ? item.plexKey
                : String(item.plexKey)
              : undefined

          const notificationSent = await this.sendWatchlistNotifications(user, {
            id: itemId,
            title: item.title,
            type: item.type,
            thumb: item.thumb,
          })

          if (notificationSent) {
            notificationsSent++
          }
        }
      }
    }

    if (notificationsSent > 0) {
      this.log.info(
        `Sent ${notificationsSent} notifications for newly added items during full sync`,
      )
    } else {
      this.log.debug('No new notifications needed for full sync items')
    }
  }

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

    this.log.info(
      `Linking ${linkItems.length} existing items to ${existingItemsToLink.size} users`,
    )

    this.log.debug('Linking details:', {
      userCounts,
      sample: linkItems.slice(0, 3).map((item) => ({
        title: item.title,
        key: item.key,
        userId: item.user_id,
      })),
    })

    try {
      await this.dbService.createWatchlistItems(linkItems, {
        onConflict: 'merge',
      })

      await this.dbService.syncGenresFromWatchlist()

      this.log.info(
        `Successfully linked ${linkItems.length} existing items to new users`,
      )
    } catch (error) {
      this.log.error('Error linking existing items', {
        error: error instanceof Error ? error.message : String(error),
      })
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

    this.log.debug(`Created key map with ${map.size} unique keys`, {
      totalItems: existingItems.length,
      skippedItems: skippedCount,
      uniqueKeys: map.size,
    })

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
        this.log.warn(`Item missing key/id for user ${user.username}`, {
          title: item.title,
        })
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
            this.log.warn(`Invalid template item for ${lookupKey}`, {
              hasTitle: !!templateItem?.title,
              hasType: !!templateItem?.type,
            })
            newItems.add(item)
            newItemsCount++
          }
        }
      }
    }

    this.log.info(
      `Processed ${items.size} items for user ${user.username}: ${newItemsCount} new, ${toBeLinkedCount} to link`,
    )

    this.log.debug(`Detailed separation results for ${user.username}:`, {
      total: items.size,
      newItems: newItemsCount,
      existingInDb: existingItemsCount,
      alreadyLinked: alreadyLinkedCount,
      toBeLinked: toBeLinkedCount,
    })

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
        this.log.info(
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
      guids: parseGuids(item.guids), // Use parseGuids directly
      genres: this.safeParseArray<string>(item.genres), // Keep safeParseArray for genres
      status: 'pending' as const,
    }
  }

  // Keep this method for parsing non-GUID arrays
  private safeParseArray<T>(value: unknown): T[] {
    if (Array.isArray(value)) {
      return value as T[]
    }

    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value)
        return (
          Array.isArray(parsed) ? parsed : [parsed].filter(Boolean)
        ) as T[]
      } catch (e) {
        return (value ? [value] : []) as T[]
      }
    }

    return (value ? [value] : []) as T[]
  }

  async processRssWatchlists(): Promise<RssWatchlistResults> {
    const config = await this.ensureRssFeeds()

    // Create a snapshot for this specific operation
    const existingGuidsSnapshot = await this.createGuidsSnapshot()

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

  private async ensureRssFeeds() {
    let config = await this.dbService.getConfig()

    if (!config?.selfRss && !config?.friendsRss) {
      this.log.info('No RSS feeds found in database, attempting to generate...')
      await this.generateAndSaveRssFeeds()
      config = await this.dbService.getConfig()

      if (!config?.selfRss && !config?.friendsRss) {
        throw new Error('Unable to generate or retrieve RSS feed URLs')
      }
    }

    return config
  }

  async storeRssWatchlistItems(
    items: Set<TemptRssWatchlistItem>,
    source: 'self' | 'friends',
  ): Promise<void> {
    const formattedItems = Array.from(items).map((item) => ({
      title: item.title,
      type: item.type,
      thumb: item.thumb || undefined,
      guids: parseGuids(item.guids),
      genres: Array.isArray(item.genres)
        ? item.genres
        : item.genres
          ? [item.genres]
          : undefined,
      source: source,
    }))

    if (formattedItems.length > 0) {
      await this.dbService.createTempRssItems(formattedItems)
      await this.dbService.syncGenresFromWatchlist()
      this.log.info(`Stored ${formattedItems.length} RSS items for ${source}`)
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

    const primaryUser = await this.dbService.getPrimaryUser()
    if (!primaryUser) {
      throw new Error('No primary token user found')
    }

    const watchlistGroup: WatchlistGroup = {
      user: {
        watchlistId: primaryUser.name,
        username: primaryUser.name,
        userId: primaryUser.id,
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
      genres: this.safeParseArray<string>(item.genres),
      status: 'pending' as const,
    }))
  }

  async matchRssPendingItemsSelf(
    userWatchlistMap: Map<Friend, Set<TokenWatchlistItem>>,
    existingGuidsSnapshot: Set<string>,
  ): Promise<void> {
    return this.processRssPendingItems(
      userWatchlistMap,
      existingGuidsSnapshot,
      'self',
    )
  }

  async matchRssPendingItemsFriends(
    userWatchlistMap: Map<Friend, Set<TokenWatchlistItem>>,
    existingGuidsSnapshot: Set<string>,
  ): Promise<void> {
    return this.processRssPendingItems(
      userWatchlistMap,
      existingGuidsSnapshot,
      'friends',
    )
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
      this.log.info(
        `Detected ${removedKeys.length} removed items for user ${userId}`,
      )
      await this.dbService.deleteWatchlistItems(userId, removedKeys)
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
   * @param existingGuidsSnapshot - Snapshot of existing GUIDs before sync
   * @param source - Source of RSS items ('self' or 'friends')
   * @returns Promise resolving when processing is complete
   */
  private async processRssPendingItems(
    userWatchlistMap: Map<Friend, Set<TokenWatchlistItem>>,
    existingGuidsSnapshot: Set<string>,
    source: 'self' | 'friends',
  ): Promise<void> {
    const pendingItems = await this.dbService.getTempRssItems(source)
    this.log.info(
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
      let foundMatch = false

      for (const [user, items] of userWatchlistMap.entries()) {
        for (const item of items) {
          const itemGuids = this.getParsedGuids(guidCache, item.guids || [])

          // Use existing hasMatchingParsedGuids function
          if (hasMatchingParsedGuids(pendingGuids, itemGuids)) {
            foundMatch = true
            matchCount++
            matchedItemIds.push(pendingItem.id)

            this.log.info(
              `Matched item "${pendingItem.title}" to user ${user.username}'s item "${item.title}"`,
              { userId: user.userId },
            )

            // Check if notification should be sent
            let shouldSendNotification = true

            // Check if already notified (using prefetched data)
            const userNotifications = notificationChecks.get(user.userId)
            if (userNotifications?.get(item.title)) {
              this.log.info(
                `Skipping notification for "${item.title}" - already sent previously to user ID ${user.userId}`,
              )
              shouldSendNotification = false
            }

            // Check if existed before sync
            if (shouldSendNotification) {
              for (const guid of pendingGuids) {
                const normalizedGuid = guid.toLowerCase()
                if (existingGuidsSnapshot.has(normalizedGuid)) {
                  this.log.info(
                    `Skipping notification for "${item.title}" - item with GUID ${guid} already existed before sync for user ID ${user.userId}`,
                    { itemTitle: item.title, guid, userId: user.userId },
                  )
                  shouldSendNotification = false
                  break
                }
              }
            }

            // Send notification if needed
            if (shouldSendNotification) {
              await this.sendWatchlistNotifications(user, {
                id: item.id,
                title: item.title,
                type: item.type || 'unknown',
                thumb: item.thumb,
              })
            }

            break // Exit inner loop once we find a match
          }
        }

        if (foundMatch) break // Exit outer loop once a match is found
      }

      // Handle non-matching items
      if (!foundMatch) {
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
              this.log.info(
                `RSS item "${pendingItem.title}" already exists in watchlist database with GUID ${guid}`,
                {
                  itemTitle: pendingItem.title,
                  guid,
                  matchCount: existingItems.length,
                },
              )
              break
            }
          } catch (error) {
            this.log.error(`Error checking database for GUID ${guid}:`, error)
          }
        }

        if (existsInDatabase) {
          duplicateCount++
          duplicateItemIds.push(pendingItem.id)
        } else {
          this.log.warn(
            `No match found for ${source} RSS item "${pendingItem.title}" (possibly recently removed from watchlist)`,
            { itemTitle: pendingItem.title },
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

    this.log.info(`${source} RSS matching complete`, {
      totalChecked: pendingItems.length,
      matched: matchCount,
      unmatched: noMatchCount,
      duplicatesCleanedUp: duplicateCount,
      remainingUnmatched: noMatchCount - duplicateCount,
    })
  }
}
