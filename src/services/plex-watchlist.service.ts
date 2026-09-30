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
import { extractUuidFromThumb } from '@utils/plex-avatar.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type { PlexLabelSyncService } from './plex-label-sync.service.js'
import { pingPlex } from './plex-watchlist/api/client.js'
import {
  cancelFriendRequest,
  getFriendRequests,
  getFriends,
  sendFriendRequest,
} from './plex-watchlist/fetching/friends-api.js'
import {
  fetchSelfWatchlist,
  getOthersWatchlist,
} from './plex-watchlist/fetching/watchlist-fetcher.js'
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
  type FriendUsersDeps,
} from './plex-watchlist/users/friend-users.js'
import { ensureTokenUsers } from './plex-watchlist/users/token-users.js'

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

  private get userDeps(): FriendUsersDeps {
    return {
      config: this.config,
      db: this.dbService,
      logger: this.log,
      fastify: this.fastify,
    }
  }

  private get categorizerDeps(): ItemCategorizerDeps {
    return {
      logger: this.log,
    }
  }

  private get watchlistSyncDeps(): WatchlistSyncDeps {
    return {
      db: this.dbService,
      logger: this.log,
    }
  }

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

  private get removalHandlerDeps(): RemovalHandlerDeps {
    return {
      db: this.dbService,
      logger: this.log,
      plexLabelSyncService: this.plexLabelSyncService,
    }
  }

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

    await this.ensureTokenUsers()

    const primaryUser = await this.dbService.getPrimaryUser()
    if (!primaryUser) {
      throw new Error('Primary Plex user not found')
    }

    const userWatchlistMap = new Map<Friend, Set<TokenWatchlistItem>>()

    const token = this.config.plexTokens[0]
    const tokenConfig = {
      ...this.config,
      plexTokens: [token],
    }

    const items = await fetchSelfWatchlist(
      tokenConfig,
      this.log,
      primaryUser.id,
      (userId: number) => this.dbService.getAllWatchlistItemsForUser(userId),
    )

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

  /** Also creates and deletes DB users; returns empty changes without touching the DB if the friends API fails. */
  async checkFriendChanges(): Promise<FriendChangesResult> {
    if (this.config.plexTokens.length === 0) {
      throw new Error('No Plex token configured')
    }

    const friendsResult = await getFriends(this.config, this.log)

    if (!friendsResult.success) {
      this.log.warn(
        'Friend API completely failed - skipping cleanup to prevent data loss',
      )
      return { added: [], removed: [], userMap: new Map() }
    }

    // Ensure token users are up-to-date before cleanup (handles username changes)
    await this.ensureTokenUsers()

    const removed = await this.checkForRemovedFriends(friendsResult.friends)

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

    await this.checkForRemovedFriends(friendsResult.friends)

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
      this.log,
      friendsWithIds,
      (userId: number) => this.dbService.getAllWatchlistItemsForUser(userId),
    )

    if (userWatchlistMap.size === 0 && friendsWithIds.size > 0) {
      throw new Error("Unable to fetch others' watchlist items")
    }

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

  private async ensureTokenUsers(): Promise<Map<string, number>> {
    return ensureTokenUsers(this.userDeps)
  }

  private async ensureFriendUsers(
    friends: Set<[Friend, string]>,
  ): Promise<{ userMap: Map<string, UserMapEntry>; added: EtagUserInfo[] }> {
    return ensureFriendUsers(friends, this.userDeps)
  }

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

    const friendsByUuid = new Map<string, Friend>()
    for (const [friend] of friendsResult.friends) {
      friendsByUuid.set(friend.watchlistId, friend)
    }

    const serverUsersByUuid = new Map<string, PlexUser>()
    for (const user of serverUsers) {
      const uuid = extractUuidFromThumb(user.thumb)
      if (uuid) {
        serverUsersByUuid.set(uuid, user)
      } else if (user.thumb) {
        this.log.warn(
          { thumb: user.thumb, username: user.username },
          'Could not extract UUID from server user thumb URL',
        )
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
        const serverUser = serverUsersByUuid.get(uuid)
        if (!serverUser?.email && serverUser?.restricted) {
          status = 'managed'
        } else {
          status = 'server_only'
        }
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

  async processRssWatchlistsWithUserDetails(): Promise<RssWatchlistResults> {
    return processRssWatchlistsWithUserDetails(this.rssProcessorDeps)
  }

  private async checkForRemovedFriends(
    currentFriends: Set<[Friend, string]>,
  ): Promise<EtagUserInfo[]> {
    return checkForRemovedFriends(currentFriends, this.userDeps)
  }
}
