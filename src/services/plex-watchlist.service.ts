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
import type {
  Item as WatchlistItem,
  TokenWatchlistItem,
  Friend,
  RssWatchlistResults,
  WatchlistGroup,
  TemptRssWatchlistItem,
} from '@root/types/plex.types.js'

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

    const userMap = await this.ensureTokenUsers()
    const userWatchlistMap = new Map<Friend, Set<TokenWatchlistItem>>()

    await Promise.all(
      this.config.plexTokens.map(async (token, index) => {
        const tokenConfig = {
          ...this.config,
          plexTokens: [token],
        }
        const username = `token${index + 1}`
        const userId = userMap.get(username)

        if (!userId) {
          this.log.error(`No user ID found for token user: ${username}`)
          return
        }

        const items = await fetchSelfWatchlist(tokenConfig, this.log, userId)

        if (items.size > 0) {
          const tokenUser: Friend = {
            watchlistId: username,
            username: username,
            userId: userId,
          }
          userWatchlistMap.set(tokenUser, items)
        }
      }),
    )

    if (userWatchlistMap.size === 0) {
      throw new Error('Unable to fetch watchlist items')
    }

    const { allKeys, userKeyMap } =
      this.extractKeysAndRelationships(userWatchlistMap)
    const existingItems = await this.getExistingItems(userKeyMap, allKeys)
    const { brandNewItems, existingItemsToLink } = this.categorizeItems(
      userWatchlistMap,
      existingItems,
    )

    const processedItems = await this.processAndSaveNewItems(brandNewItems)
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
    await this.dbService.updateConfig(1, dbUrls)
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

    const friends = await getFriends(this.config, this.log)
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

    if (userWatchlistMap.size === 0) {
      throw new Error("Unable to fetch others' watchlist items")
    }

    const { allKeys, userKeyMap } =
      this.extractKeysAndRelationships(userWatchlistMap)
    const existingItems = await this.getExistingItems(userKeyMap, allKeys)
    const { brandNewItems, existingItemsToLink } = this.categorizeItems(
      userWatchlistMap,
      existingItems,
    )

    const processedItems = await this.processAndSaveNewItems(brandNewItems)
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

  private async ensureTokenUsers(): Promise<Map<string, number>> {
    const userMap = new Map<string, number>()

    await Promise.all(
      this.config.plexTokens.map(async (_, index) => {
        const username = `token${index + 1}`

        let user = await this.dbService.getUser(username)

        if (!user) {
          user = await this.dbService.createUser({
            name: username,
            email: `${username}@placeholder.com`,
            alias: null,
            discord_id: null,
            notify_email: false,
            notify_discord: false,
            can_sync: true,
          })
        }

        if (!user.id) throw new Error(`No ID for user ${username}`)
        userMap.set(username, user.id)
      }),
    )

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
            email: `${friend.username}@placeholder.com`,
            alias: null,
            discord_id: null,
            notify_email: false,
            notify_discord: false,
            can_sync: true,
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
  ): Promise<Map<Friend, Set<WatchlistItem>>> {
    if (brandNewItems.size === 0) {
      return new Map<Friend, Set<WatchlistItem>>()
    }

    this.log.debug(`Processing ${brandNewItems.size} new items`)

    const operationId = `process-${Date.now()}`
    const emitProgress = this.fastify.progress.hasActiveConnections()

    const firstUser = Array.from(brandNewItems.keys())[0]
    const type = firstUser.username.startsWith('token')
      ? 'self-watchlist'
      : 'others-watchlist'

    if (emitProgress) {
      this.fastify.progress.emit({
        operationId,
        type,
        phase: 'start',
        progress: 0,
        message: `Starting ${type === 'self-watchlist' ? 'self' : 'others'} watchlist processing`,
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
      guids: templateItem.guids || [],
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
        guids: item.guids || [],
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
      guids: this.safeParseArray<string>(item.guids),
      genres: this.safeParseArray<string>(item.genres),
      status: 'pending' as const,
    }
  }

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
    let config = await this.dbService.getConfig(1)

    if (!config?.selfRss && !config?.friendsRss) {
      this.log.info('No RSS feeds found in database, attempting to generate...')
      await this.generateAndSaveRssFeeds()
      config = await this.dbService.getConfig(1)

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
      guids: Array.isArray(item.guids)
        ? item.guids
        : item.guids
          ? [item.guids]
          : [],
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

    const watchlistGroup: WatchlistGroup = {
      user: {
        watchlistId: 'token1',
        username: 'token1',
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
      'otherRSS',
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
      guids: Array.isArray(item.guids)
        ? item.guids
        : item.guids
          ? [item.guids]
          : [],
      genres: Array.isArray(item.genres)
        ? item.genres
        : item.genres
          ? [item.genres]
          : [],
      status: 'pending' as const,
    }))
  }

  async matchRssPendingItemsSelf(
    userWatchlistMap: Map<Friend, Set<TokenWatchlistItem>>,
  ): Promise<void> {
    const pendingItems = await this.dbService.getTempRssItems('self')

    this.log.info(
      `Found ${pendingItems.length} pending RSS items to match during self sync`,
    )
    let matchCount = 0
    let noMatchCount = 0
    let duplicateCount = 0
    const matchedItemIds: number[] = []
    const duplicateItemIds: number[] = []

    for (const pendingItem of pendingItems) {
      const pendingGuids = this.safeParseArray<string>(pendingItem.guids)

      this.log.debug(
        `Processing RSS item "${pendingItem.title}" with GUIDs:`,
        pendingGuids,
      )
      let foundMatch = false

      for (const [user, items] of userWatchlistMap.entries()) {
        for (const item of items) {
          const itemGuids = this.safeParseArray<string>(item.guids)

          const hasMatch = pendingGuids.some((pendingGuid: string) =>
            itemGuids.some(
              (itemGuid: string) =>
                itemGuid.toLowerCase() === pendingGuid.toLowerCase(),
            ),
          )

          if (hasMatch) {
            foundMatch = true
            matchCount++
            matchedItemIds.push(pendingItem.id)

            this.log.info(
              `Matched item "${pendingItem.title}" to user ${user.username}'s item "${item.title}"`,
              {
                pendingGuids,
                itemGuids,
                userId: user.userId,
              },
            )

            const notificationSent =
              await this.fastify.discord.sendMediaNotification({
                username: user.username,
                title: item.title,
                type: item.type as 'movie' | 'show',
                posterUrl: item.thumb,
              })

            if (notificationSent) {
              const itemId =
                typeof item.id === 'string'
                  ? Number.parseInt(item.id, 10)
                  : item.id
              await this.dbService.createNotificationRecord({
                watchlist_item_id: !Number.isNaN(itemId) ? itemId : null,
                user_id: user.userId,
                type: 'watchlist_add',
                title: item.title,
                message: `New ${item.type} added to watchlist (self sync)`,
                sent_to_discord: false,
                sent_to_email: false,
                sent_to_webhook: true,
              })
            }

            break
          }
        }
        if (foundMatch) break
      }

      if (!foundMatch) {
        noMatchCount++

        let existsInDatabase = false

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
            `No match found for self RSS item "${pendingItem.title}" (possibly recently removed from watchlist)`,
            {
              itemTitle: pendingItem.title,
              pendingGuids,
            },
          )
        }
      }
    }

    const allIdsToDelete = [...matchedItemIds, ...duplicateItemIds]
    if (allIdsToDelete.length > 0) {
      await this.dbService.deleteTempRssItems(allIdsToDelete)
    }

    this.log.info('Self RSS matching complete', {
      totalChecked: pendingItems.length,
      matched: matchCount,
      unmatched: noMatchCount,
      duplicatesCleanedUp: duplicateCount,
      remainingUnmatched: noMatchCount - duplicateCount,
    })
  }

  async matchRssPendingItemsFriends(
    userWatchlistMap: Map<Friend, Set<TokenWatchlistItem>>,
  ): Promise<void> {
    const pendingItems = await this.dbService.getTempRssItems('friends')
    this.log.info(
      `Found ${pendingItems.length} pending RSS items to match during friend sync`,
    )
    let matchCount = 0
    let noMatchCount = 0
    let duplicateCount = 0
    const matchedItemIds: number[] = []
    const duplicateItemIds: number[] = []

    const userIds = Array.from(userWatchlistMap.keys()).map(
      (user) => user.userId,
    )
    const existingItems = await this.dbService.getBulkWatchlistItems(
      userIds,
      [],
    )
    const existingGuidsMap = new Map<number, Set<string>>()

    for (const item of existingItems) {
      if (!item.user_id) continue
      const guids = this.safeParseArray<string>(item.guids)
      if (!existingGuidsMap.has(item.user_id)) {
        existingGuidsMap.set(item.user_id, new Set<string>())
      }
      for (const guid of guids) {
        existingGuidsMap.get(item.user_id)?.add(guid.toLowerCase())
      }
    }

    for (const pendingItem of pendingItems) {
      const pendingGuids = this.safeParseArray<string>(pendingItem.guids)
      let foundAnyMatch = false

      for (const [friend, items] of userWatchlistMap.entries()) {
        for (const item of items) {
          const itemGuids = this.safeParseArray<string>(item.guids)

          const hasMatch = pendingGuids.some((pendingGuid: string) =>
            itemGuids.some(
              (guid) => guid.toLowerCase() === pendingGuid.toLowerCase(),
            ),
          )

          if (hasMatch) {
            foundAnyMatch = true
            matchCount++
            matchedItemIds.push(pendingItem.id)

            const userExistingGuids =
              existingGuidsMap.get(friend.userId) || new Set<string>()

            const isNewItem = !itemGuids.some((guid: string) =>
              userExistingGuids.has(guid.toLowerCase()),
            )

            if (isNewItem) {
              const notificationSent =
                await this.fastify.discord.sendMediaNotification({
                  username: friend.username,
                  title: item.title,
                  type: item.type as 'movie' | 'show',
                  posterUrl: item.thumb,
                })

              if (notificationSent) {
                const itemId =
                  typeof item.id === 'string'
                    ? Number.parseInt(item.id, 10)
                    : item.id
                await this.dbService.createNotificationRecord({
                  watchlist_item_id: !Number.isNaN(itemId) ? itemId : null,
                  user_id: friend.userId,
                  type: 'watchlist_add',
                  title: item.title,
                  message: `New ${item.type} added to watchlist`,
                  sent_to_discord: false,
                  sent_to_email: false,
                  sent_to_webhook: true,
                })
              }

              this.log.info(
                `Sent notification for new item "${item.title}" for user ${friend.username}`,
                {
                  pendingGuids,
                  itemGuids,
                  userId: friend.userId,
                  notificationSent,
                },
              )
            }

            break
          }
        }
        if (foundAnyMatch) break
      }

      if (!foundAnyMatch) {
        noMatchCount++

        let existsInDatabase = false

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
            `No matches found for friend RSS item "${pendingItem.title}" (possibly recently removed from watchlist)`,
            {
              itemTitle: pendingItem.title,
              pendingGuids,
            },
          )
        }
      }
    }

    const allIdsToDelete = [...matchedItemIds, ...duplicateItemIds]
    if (allIdsToDelete.length > 0) {
      await this.dbService.deleteTempRssItems(allIdsToDelete)
    }

    this.log.info('Friend RSS matching complete', {
      totalChecked: pendingItems.length,
      matched: matchCount,
      unmatched: noMatchCount,
      duplicatesCleanedUp: duplicateCount,
      remainingUnmatched: noMatchCount - duplicateCount,
    })
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
}
