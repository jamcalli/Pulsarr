import type {
  EtagUserInfo,
  Friend,
  FriendChangesResult,
  FriendRequestNode,
  FriendRequestsResult,
  FriendsResult,
  RssWatchlistResults,
  TokenWatchlistItem,
  UserMapEntry,
  Item as WatchlistItem,
} from '@root/types/plex.types.js'
import type { PlexUser } from '@root/types/plex-server.types.js'
import type { RssFeedsSuccess } from '@schemas/plex/generate-rss-feeds.schema.js'
import type {
  PlexClassifiedUser,
  PlexUntrackedUser,
  UserStatusResponse,
} from '@schemas/plex/user-status.schema.js'
import { createServiceLogger } from '@utils/logger.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type { PlexLabelSyncService } from './plex-label-sync.service.js'
import {
  cancelFriendRequest,
  fetchSelfWatchlist,
  getFriendRequests,
  getFriends,
  getOthersWatchlist,
  pingPlex,
  sendFriendRequest,
} from './plex-watchlist/index.js'
import {
  type ItemProcessorDeps,
  linkExistingItems,
  processAndSaveNewItems,
} from './plex-watchlist/orchestration/item-processor.js'
import {
  checkForRemovedItems,
  handleLinkedItemsForLabelSync,
  type RemovalHandlerDeps,
} from './plex-watchlist/orchestration/removal-handler.js'
import {
  generateAndSaveRssFeeds,
  processRssWatchlists,
  processRssWatchlistsWithUserDetails,
  type RssProcessorDeps,
} from './plex-watchlist/orchestration/rss-processor.js'
import {
  buildResponse,
  extractKeysAndRelationships,
  getExistingItems,
  type WatchlistSyncDeps,
} from './plex-watchlist/orchestration/watchlist-sync.js'
import {
  categorizeItems,
  type ItemCategorizerDeps,
} from './plex-watchlist/sync/item-categorizer.js'
import {
  checkForRemovedFriends,
  ensureFriendUsers,
  ensureTokenUsers,
  type FriendUsersDeps,
} from './plex-watchlist/users/index.js'

function extractUuidFromThumb(thumb: string | undefined): string | null {
  const match = thumb?.match(/plex\.tv\/users\/([a-f0-9]+)\/avatar/i)
  return match?.[1] ?? null
}

export class PlexWatchlistService {
  private readonly log: FastifyBaseLogger

  constructor(
    readonly baseLog: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
    private readonly dbService: FastifyInstance['db'],
    private readonly plexLabelSyncService?: PlexLabelSyncService,
  ) {
    this.log = createServiceLogger(baseLog, 'PLEX_WATCHLIST')
  }

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
      fastify: this.fastify,
      plexLabelSyncService: this.plexLabelSyncService,
      handleLinkedItemsForLabelSync: (linkItems) =>
        handleLinkedItemsForLabelSync(linkItems, this.removalHandlerDeps),
    }
  }

  /** Gets the dependencies object for removal handler operations */
  private get removalHandlerDeps(): RemovalHandlerDeps {
    return {
      db: this.dbService,
      logger: this.log,
      plexLabelSyncService: this.plexLabelSyncService,
    }
  }

  /** Gets the dependencies object for RSS processor operations */
  private get rssProcessorDeps(): RssProcessorDeps {
    return {
      db: this.dbService,
      logger: this.log,
      config: this.config,
      fastify: this.fastify,
    }
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
      handleLinkedItemsForLabelSync: (linkItems) =>
        handleLinkedItemsForLabelSync(linkItems, this.removalHandlerDeps),
    })

    await checkForRemovedItems(userWatchlistMap, this.removalHandlerDeps)

    return buildResponse(
      userWatchlistMap,
      existingItems,
      existingItemsToLink,
      processedItems,
    )
  }

  async generateAndSaveRssFeeds(): Promise<RssFeedsSuccess> {
    return generateAndSaveRssFeeds(this.rssProcessorDeps)
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
          const userEntry = userMap.get(friend.watchlistId)
          if (!userEntry) {
            this.log.warn(
              `No user ID found for friend with watchlist ID: ${friend.watchlistId}`,
            )
            return null
          }
          return [{ ...friend, userId: userEntry.userId }, token] as [
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
      handleLinkedItemsForLabelSync: (linkItems) =>
        handleLinkedItemsForLabelSync(linkItems, this.removalHandlerDeps),
    })

    await checkForRemovedItems(userWatchlistMap, this.removalHandlerDeps)

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
  ): Promise<{ userMap: Map<string, UserMapEntry>; added: EtagUserInfo[] }> {
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

  async getAllFriends(): Promise<FriendsResult> {
    return getFriends(this.config, this.log)
  }

  async getAllFriendRequests(): Promise<FriendRequestsResult> {
    return getFriendRequests(this.config, this.log)
  }

  async sendFriendRequest(uuid: string): Promise<{ success: boolean }> {
    return sendFriendRequest(this.config, this.log, uuid)
  }

  async cancelFriendRequest(uuid: string): Promise<{ success: boolean }> {
    return cancelFriendRequest(this.config, this.log, uuid)
  }

  async getClassifiedUsers(): Promise<UserStatusResponse> {
    const [friendsResult, serverUsers, friendRequests, dbUsers] =
      await Promise.all([
        getFriends(this.config, this.log),
        this.fastify.plexServerService.getPlexUsers({ skipCache: true }),
        getFriendRequests(this.config, this.log),
        this.dbService.getAllUsers(),
      ])

    // Guard against API failures to prevent misclassification
    if (!friendsResult.success) {
      this.log.warn(
        'Friend API failed - skipping classification to prevent misclassifying users',
      )
      return { success: false, users: [], untracked: [] }
    }

    if (!friendRequests.success) {
      this.log.warn(
        'Friend requests API failed - pending request statuses may be missing',
      )
    }

    // Build lookup maps
    const friendsByUuid = new Map<string, Friend>()
    for (const [friend] of friendsResult.friends) {
      friendsByUuid.set(friend.watchlistId, friend)
    }

    const serverUsersByUuid = new Map<string, PlexUser>()
    for (const user of serverUsers) {
      const uuid = extractUuidFromThumb(user.thumb)
      if (uuid) {
        serverUsersByUuid.set(uuid, user)
      }
    }

    const pendingSentByUuid = new Map<string, FriendRequestNode>()
    for (const node of friendRequests.sent) {
      pendingSentByUuid.set(node.user.id, node)
    }

    const pendingReceivedByUuid = new Map<string, FriendRequestNode>()
    for (const node of friendRequests.received) {
      pendingReceivedByUuid.set(node.user.id, node)
    }

    const dbUsersByUuid = new Map<string, (typeof dbUsers)[number]>()
    for (const user of dbUsers) {
      if (user.plex_uuid) {
        dbUsersByUuid.set(user.plex_uuid, user)
      }
    }

    // Collect all known UUIDs
    const allUuids = new Set<string>([
      ...friendsByUuid.keys(),
      ...serverUsersByUuid.keys(),
      ...pendingSentByUuid.keys(),
      ...pendingReceivedByUuid.keys(),
    ])

    const users: PlexClassifiedUser[] = []
    const untracked: PlexUntrackedUser[] = []

    for (const uuid of allUuids) {
      const inFriends = friendsByUuid.has(uuid)
      const inServer = serverUsersByUuid.has(uuid)
      const inPendingSent = pendingSentByUuid.has(uuid)
      const inPendingReceived = pendingReceivedByUuid.has(uuid)

      let status: PlexClassifiedUser['status']
      if (inFriends && inServer) {
        status = 'friend'
      } else if (inServer && inPendingSent) {
        status = 'pending_sent'
      } else if (inServer && inPendingReceived) {
        status = 'pending_received'
      } else if (inServer && !inFriends && !inPendingSent) {
        status = 'server_only'
      } else if (inFriends && !inServer) {
        status = 'friend_only'
      } else if (inPendingReceived) {
        status = 'pending_received'
      } else if (inPendingSent) {
        status = 'pending_sent'
      } else {
        continue
      }

      const friend = friendsByUuid.get(uuid)
      const serverUser = serverUsersByUuid.get(uuid)
      const pendingSent = pendingSentByUuid.get(uuid)
      const pendingReceived = pendingReceivedByUuid.get(uuid)

      // Merge metadata from whichever source has it
      const username =
        friend?.username ??
        serverUser?.username ??
        pendingSent?.user.username ??
        pendingReceived?.user.username ??
        ''
      const avatar =
        friend?.avatar ??
        serverUser?.thumb ??
        pendingSent?.user.avatar ??
        pendingReceived?.user.avatar ??
        ''
      const displayName =
        friend?.displayName ??
        pendingSent?.user.displayName ??
        pendingReceived?.user.displayName ??
        serverUser?.title ??
        username
      const pendingSince =
        pendingSent?.createdAt ?? pendingReceived?.createdAt ?? null

      const dbUser = dbUsersByUuid.get(uuid)

      if (dbUser) {
        users.push({
          uuid,
          username,
          avatar,
          displayName,
          status,
          friendCreatedAt: friend?.createdAt ?? null,
          pendingSince,
        })
      } else {
        untracked.push({
          uuid,
          username,
          avatar,
          status,
          pendingSince,
        })
      }
    }

    return { success: true, users, untracked }
  }

  async processRssWatchlists(): Promise<RssWatchlistResults> {
    return processRssWatchlists(this.rssProcessorDeps)
  }

  /**
   * Process RSS watchlists with real user details for API responses
   * This method is optimized for API endpoints that need actual user information
   */
  async processRssWatchlistsWithUserDetails(): Promise<RssWatchlistResults> {
    return processRssWatchlistsWithUserDetails(this.rssProcessorDeps)
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
}
