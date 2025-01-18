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

export class PlexWatchlistService {
  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly config: FastifyInstance['config'],
    private readonly dbService: FastifyInstance['db'],
  ) {}

  async pingPlex(): Promise<boolean> {
    const tokens = this.config.userConfig.plexTokens

    if (tokens.length === 0) {
      throw new Error('No Plex tokens configured')
    }

    await Promise.all(tokens.map((token) => pingPlex(token, this.log)))
    return true
  }

  async getSelfWatchlist() {
    if (this.config.userConfig.plexTokens.length === 0) {
      throw new Error('No Plex token configured')
    }

    const userMap = await this.ensureTokenUsers()
    const userWatchlistMap = new Map<Friend, Set<TokenWatchlistItem>>()

    await Promise.all(
      this.config.userConfig.plexTokens.map(async (token, index) => {
        const tokenConfig = {
          ...this.config.userConfig,
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

    // Create a combined map of all items with their GUIDs for matching
    const allItemsMap = new Map<Friend, Set<WatchlistItem>>()

    // Add existing items first
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

    // Only add processed items if they don't already exist
    for (const [user, items] of processedItems.entries()) {
      const existingUserItems =
        allItemsMap.get(user) || new Set<WatchlistItem>()
      for (const item of items) {
        // Only add if not already in existingItems
        if (!existingUserItems.has(item)) {
          existingUserItems.add(item)
        }
      }
      allItemsMap.set(user, existingUserItems)
    }

    // Match against all items (both new and existing)
    await this.matchRssPendingItemsSelf(
      allItemsMap as Map<Friend, Set<TokenWatchlistItem>>,
    )

    return this.buildResponse(
      userWatchlistMap,
      existingItems,
      existingItemsToLink,
      processedItems,
    )
  }

  async generateAndSaveRssFeeds(): Promise<void> {
    const tokens = this.config.userConfig.plexTokens
    if (tokens.length === 0) {
      throw new Error('No Plex token configured')
    }

    const tokenSet: Set<string> = new Set(tokens)
    const skipFriendSync = this.config.userConfig.skipFriendSync || false

    const watchlistUrls = await getPlexWatchlistUrls(
      tokenSet,
      skipFriendSync,
      this.log,
    )

    if (watchlistUrls.size === 0) {
      throw new Error('Unable to fetch watchlist URLs')
    }

    const urls = {
      selfRss: Array.from(watchlistUrls)[0] || '',
      friendsRss: Array.from(watchlistUrls)[1] || '',
    }

    await this.dbService.updateConfig(1, urls)
    this.log.info('RSS feed URLs saved to database', urls)
  }

  async getOthersWatchlists() {
    if (this.config.userConfig.plexTokens.length === 0) {
      throw new Error('No Plex token configured')
    }

    const friends = await getFriends(this.config.userConfig, this.log)
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
      this.config.userConfig,
      this.log,
      friendsWithIds,
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

    // Create a combined map of all items with their GUIDs for matching
    const allItemsMap = new Map<Friend, Set<WatchlistItem>>()

    // Add processed items
    for (const [user, items] of processedItems.entries()) {
      allItemsMap.set(user, items)
    }

    // Add existing items
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

    // Match against all items (both new and existing)
    await this.matchRssPendingItemsFriends(
      allItemsMap as Map<Friend, Set<TokenWatchlistItem>>,
    )

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
      this.config.userConfig.plexTokens.map(async (_, index) => {
        const username = `token${index + 1}`

        let user = await this.dbService.getUser(username)

        if (!user) {
          user = await this.dbService.createUser({
            name: username,
            email: `${username}@placeholder.com`,
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
    const userIds = Array.from(userKeyMap.keys()).map(Number)

    const existingItems = await this.dbService.getBulkWatchlistItems(
      userIds,
      keys,
    )

    this.log.info(`Found ${existingItems.length} existing items in database`, {
      itemCount: existingItems.length,
      uniqueUsers: new Set(existingItems.map((item) => item.user_id)).size,
      uniqueKeys: new Set(existingItems.map((item) => item.key)).size,
    })

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

    const processedItems = await processWatchlistItems(
      this.config.userConfig,
      this.log,
      brandNewItems,
    )

    if (processedItems instanceof Map) {
      const itemsToInsert = this.prepareItemsForInsertion(processedItems)

      if (itemsToInsert.length > 0) {
        await this.dbService.createWatchlistItems(itemsToInsert)
        this.log.info(`Processed ${itemsToInsert.length} new items`)
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
    const linkItems = Array.from(existingItemsToLink.values()).flatMap(
      (items) => Array.from(items),
    )

    if (linkItems.length > 0) {
      await this.dbService.createWatchlistItems(linkItems, {
        onConflict: 'merge',
      })
      this.log.info(`Linked ${linkItems.length} existing items to new users`)
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
    const map = new Map<string, Map<number, WatchlistItem>>()

    for (const item of existingItems) {
      if (!item.key || !item.user_id) continue

      let userMap = map.get(item.key)
      if (!userMap) {
        userMap = new Map<number, WatchlistItem>()
        map.set(item.key, userMap)
      }

      userMap.set(item.user_id, item)
    }

    return map
  }

  private separateNewAndExistingItems(
    items: Set<TokenWatchlistItem>,
    user: Friend & { userId: number },
    existingItemsByKey: Map<string, Map<number, WatchlistItem>>,
  ) {
    const newItems = new Set<TokenWatchlistItem>()
    const itemsToLink = new Set<WatchlistItem>()

    for (const item of items) {
      const existingItem = existingItemsByKey.get(item.id)
      if (!existingItem) {
        newItems.add(item)
      } else if (!Array.from(existingItem.keys()).includes(user.userId)) {
        const templateItem = existingItem.values().next().value
        if (templateItem?.title && templateItem?.type) {
          itemsToLink.add(this.createWatchlistItem(user, item, templateItem))
        }
      }
    }

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

  private prepareItemsForInsertion(
    processedItems: Map<Friend & { userId: number }, Set<WatchlistItem>>,
  ) {
    return Array.from(processedItems.entries()).flatMap(([user, items]) =>
      Array.from(items).map((item) => ({
        user_id: user.userId,
        title: item.title,
        key: item.key,
        thumb: item.thumb,
        type: item.type,
        guids: item.guids || [],
        genres: item.genres || [],
        status: 'pending' as const,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })),
    )
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
      .map(this.formatWatchlistItem)
  }

  private formatLinkedItems(
    existingItemsToLink: Map<Friend & { userId: number }, Set<WatchlistItem>>,
    user: Friend & { userId: number },
  ) {
    return existingItemsToLink.has(user)
      ? Array.from(existingItemsToLink.get(user) as Set<WatchlistItem>).map(
          this.formatWatchlistItem,
        )
      : []
  }

  private formatProcessedItems(
    processedItems: Map<Friend & { userId: number }, Set<WatchlistItem>>,
    user: Friend & { userId: number },
  ) {
    return processedItems.has(user)
      ? Array.from(processedItems.get(user) as Set<WatchlistItem>).map(
          this.formatWatchlistItem,
        )
      : []
  }

  private formatWatchlistItem(item: WatchlistItem) {
    return {
      title: item.title,
      plexKey: item.key,
      type: item.type,
      thumb: item.thumb || '',
      guids:
        typeof item.guids === 'string'
          ? JSON.parse(item.guids)
          : item.guids || [],
      genres:
        typeof item.genres === 'string'
          ? JSON.parse(item.genres)
          : item.genres || [],
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

  private async processSelfRssWatchlist(
    rssUrl: string,
  ): Promise<{ total: number; users: WatchlistGroup[] }> {
    const selfItems = await fetchWatchlistFromRss(
      rssUrl,
      'selfRSS',
      1,
      this.log,
    )

    // Store items in temp_rss_items table with proper type conversion
    await this.dbService.createTempRssItems(
      Array.from(selfItems as Set<TemptRssWatchlistItem>).map((item) => ({
        title: item.title,
        type: item.type,
        thumb: item.thumb || undefined,
        guids: Array.isArray(item.guids)
          ? item.guids
          : item.guids
            ? [item.guids]
            : [], // Ensure array
        genres: Array.isArray(item.genres)
          ? item.genres
          : item.genres
            ? [item.genres]
            : undefined, // Make optional
        source: 'self' as const,
      })),
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

    // Store items in temp_rss_items table with proper type conversion
    await this.dbService.createTempRssItems(
      Array.from(friendsItems as Set<TemptRssWatchlistItem>).map((item) => ({
        title: item.title,
        type: item.type,
        thumb: item.thumb || undefined,
        guids: Array.isArray(item.guids)
          ? item.guids
          : item.guids
            ? [item.guids]
            : [], // Ensure array
        genres: Array.isArray(item.genres)
          ? item.genres
          : item.genres
            ? [item.genres]
            : undefined, // Make optional
        source: 'friends' as const,
      })),
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

  private prepareTemporaryWatchlistItems(
    items: Set<TemptRssWatchlistItem>,
    pendingUserId: number,
  ): Array<Omit<WatchlistItem, 'created_at' | 'updated_at'>> {
    return Array.from(items).map((item) => ({
      user_id: pendingUserId,
      title: item.title,
      key: `rss_temp_${item.guids?.[0] || crypto.randomUUID()}`,
      type: item.type,
      thumb: item.thumb || '',
      guids: item.guids || [],
      genres: item.genres || [],
      status: 'pending' as const,
    }))
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
    const matchedItemIds: number[] = []

    for (const pendingItem of pendingItems) {
      let foundMatch = false
      for (const [user, items] of userWatchlistMap.entries()) {
        for (const item of items) {
          const itemGuids = (
            typeof item.guids === 'string' ? JSON.parse(item.guids) : item.guids
          ) as string[]

          if (pendingItem.guids.some((guid) => itemGuids.includes(guid))) {
            foundMatch = true
            matchCount++
            matchedItemIds.push(pendingItem.id)
            break
          }
        }
        if (foundMatch) break
      }

      if (!foundMatch) {
        noMatchCount++
        this.log.warn(
          `No match found for self RSS item "${pendingItem.title}"`,
          {
            itemTitle: pendingItem.title,
            pendingGuids: pendingItem.guids,
          },
        )
      }
    }

    // Delete matched items from temp_rss_items
    if (matchedItemIds.length > 0) {
      await this.dbService.deleteTempRssItems(matchedItemIds)
    }

    this.log.info('Self RSS matching complete', {
      totalChecked: pendingItems.length,
      matched: matchCount,
      unmatched: noMatchCount,
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
    const matchedItemIds: number[] = []

    for (const pendingItem of pendingItems) {
      let foundAnyMatch = false

      for (const [friend, items] of userWatchlistMap.entries()) {
        for (const item of items) {
          const itemGuids = (
            typeof item.guids === 'string' ? JSON.parse(item.guids) : item.guids
          ) as string[]

          if (pendingItem.guids.some((guid) => itemGuids.includes(guid))) {
            foundAnyMatch = true
            matchCount++
            matchedItemIds.push(pendingItem.id)

            break
          }
        }
        if (foundAnyMatch) break
      }

      if (!foundAnyMatch) {
        noMatchCount++
        this.log.warn(
          `No matches found for friend RSS item "${pendingItem.title}"`,
          {
            itemTitle: pendingItem.title,
            pendingGuids: pendingItem.guids,
          },
        )
      }
    }

    // Delete matched items from temp_rss_items
    if (matchedItemIds.length > 0) {
      await this.dbService.deleteTempRssItems(matchedItemIds)
    }

    this.log.info('Friend RSS matching complete', {
      totalChecked: pendingItems.length,
      matched: matchCount,
      unmatched: noMatchCount,
    })
  }
}
