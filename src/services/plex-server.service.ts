import { PLEX_DEFAULT_PORT } from '@root/schemas/plex/configure-notifications.schema.js'
import { PLEX_PROTECTION_PLAYLIST_DEFAULT } from '@root/schemas/shared/delete-sync-limits.js'
import type { User } from '@root/types/config.types.js'
import type { Item } from '@root/types/plex.types.js'
import type {
  PlexMetadata,
  PlexPlaylistItem,
  PlexResource,
  PlexServerConnectionInfo,
  PlexSharedServerInfo,
  PlexUser,
} from '@root/types/plex-server.types.js'
import type {
  PlexChildrenResponse,
  PlexSession,
  PlexShowMetadata,
  PlexShowMetadataResponse,
} from '@root/types/plex-session.types.js'
import { toItemsSingle } from '@services/plex-watchlist/enrichment/single-item.js'
import { buildPlexGuid, parseGuids } from '@utils/guid-handler.js'
import { createServiceLogger } from '@utils/logger.js'
import { extractUuidFromThumb } from '@utils/plex-avatar.js'
import { isSameServerEndpoint } from '@utils/url.js'
import { PLEX_CLIENT_IDENTIFIER } from '@utils/version.js'
import { XMLParser } from 'fast-xml-parser'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type { LRUCache } from 'lru-cache'
import {
  serverCandidates,
  warnCandidateFallback,
} from './plex-server/connection/candidates.js'
import { discoverServerConnections } from './plex-server/connection/discover-servers.js'
import { connectionTestResult } from './plex-server/connection/probe-result.js'
import { rankProbedConnections } from './plex-server/connection/ranking.js'
import {
  createServerConnectionCache,
  getBestServerConnection,
  probeConnections,
  probeServerAccess,
  type ServerConnectionCache,
  testConnectionReachability,
} from './plex-server/existence-check/connection-cache.js'
import {
  type ContentAvailabilityCache,
  checkContentOnServer,
  createContentAvailabilityCache,
} from './plex-server/existence-check/content-cache.js'
import { buildUniqueServerList } from './plex-server/existence-check/server-list-builder.js'
import {
  getCurrentLabels,
  getMetadata,
  lookupMetadata,
  type MetadataLookup,
  removeSpecificLabels,
  updateLabels,
} from './plex-server/labels/label-operations.js'
import {
  type GuidLookup,
  getMetadataChildren,
  getShowMetadata,
  lookupByGuid,
  searchByGuid,
} from './plex-server/metadata/metadata-operations.js'
import {
  type NotificationTargetInput,
  resolveNotificationTarget,
} from './plex-server/notifications/notification-target.js'
import {
  configurePlexNotifications,
  getPlexNotificationStatus,
  type PlexNotificationOutcome,
  removePlexNotifications,
} from './plex-server/notifications/plex-notifications.js'
import {
  createUserPlaylist,
  findUserPlaylistByTitle,
  getUserPlaylistItems,
} from './plex-server/playlists/index.js'
import { getAllPlexResources } from './plex-server/resources/resource-operations.js'
import { getActiveSessions } from './plex-server/sessions/session-operations.js'
import {
  PlexEventSource,
  type PlexSSEEventMap,
} from './plex-server/sse/plex-event-source.js'
import { SessionTracker } from './plex-server/sse/session-tracker.js'
import {
  type ContentScannedHandler,
  TimelineDebouncer,
} from './plex-server/sse/timeline-debouncer.js'

const PLEX_API_TIMEOUT = 30000

/** Used only when nothing better is known, and never cached. */
const PLEX_FALLBACK_URL = `http://localhost:${PLEX_DEFAULT_PORT}`
export const CONNECTION_LIST_TTL_MS = 15 * 60 * 1000
export const PLEX_TV_RETRY_GAP_MS = 60 * 1000
export const PLEX_USERS_CACHE_TTL_MS = 30 * 60 * 1000
/** Shared server info and the per-user tokens read from it. */
export const PLEX_SHARED_SERVERS_CACHE_TTL_MS = 6 * 60 * 60 * 1000

const PLEX_USER_TOKENS_CACHE_MAX = 1000
const PLEX_USERS_KEY = 'users'
const SHARED_SERVERS_KEY = 'shared-servers'
const PLEX_RESOURCES_KEY = 'resources'

interface ServerIdentity {
  machineId: string
  name: string
}

type Negotiation =
  | {
      settled: true
      connections: PlexServerConnectionInfo[]
      best: string | null
      identity: ServerIdentity
    }
  | {
      settled: false
      connections: PlexServerConnectionInfo[]
      identity: ServerIdentity | null
    }

function connectionInfo(
  url: string,
  connection?: { local: boolean; relay: boolean },
): PlexServerConnectionInfo {
  return {
    url,
    local:
      connection?.local ??
      (url.includes('localhost') || url.includes('127.0.0.1')),
    relay: connection?.relay ?? false,
  }
}

// Plex XML booleans arrive as "0"/"1" strings
const xmlBool = (val: string | boolean | undefined): boolean | undefined => {
  if (val === undefined) return undefined
  if (typeof val === 'boolean') return val
  return val === '1'
}

export class PlexServerService {
  private readonly log: FastifyBaseLogger

  private serverConnections: PlexServerConnectionInfo[] | null = null
  private serverMachineId: string | null = null
  private serverName: string | null = null

  private _hasPlexPass: boolean | null = null
  private _adminPlexId: number | null = null
  private connectionTimestamp = 0
  private selectedConnectionUrl: string | null = null
  private fallbackConnections: PlexServerConnectionInfo[] | null = null
  private negotiationFailedAt = 0
  private negotiationInFlight: Promise<Negotiation> | null = null
  private cacheGeneration = 0

  private readonly plexUsers: LRUCache<typeof PLEX_USERS_KEY, PlexUser[]>
  private readonly sharedServers: LRUCache<
    typeof SHARED_SERVERS_KEY,
    Map<string, PlexSharedServerInfo>
  >
  /** Keyed by lowercased username, with the username as typed as the fetch context. */
  private readonly userTokens: LRUCache<string, string, string>
  private readonly plexResources: LRUCache<
    typeof PLEX_RESOURCES_KEY,
    PlexResource[]
  >

  private protectedPlaylistsMap: Map<string, string> | null = null
  private protectedItemsCache: Set<string> | null = null

  private readonly serverConnectionCache: ServerConnectionCache

  /** No TTL, cleared at the start of each reconciliation. */
  private readonly contentAvailabilityCache: ContentAvailabilityCache

  private readonly deadServerCache: Map<string, number> = new Map()

  private readonly DEAD_SERVER_BACKOFF = 5 * 60 * 1000

  private eventSource: PlexEventSource | null = null
  private sessionTracker: SessionTracker | null = null
  private timelineDebouncer: TimelineDebouncer | null = null
  private staleSweepInterval: ReturnType<typeof setInterval> | null = null
  private static readonly STALE_SESSION_MS = 5 * 60 * 1000
  private static readonly STALE_SWEEP_INTERVAL_MS = 60 * 1000

  constructor(
    readonly baseLog: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {
    this.log = createServiceLogger(baseLog, 'PLEX_SERVER')
    this.log.debug('Initializing PlexServerService')

    const { caches } = fastify
    // Each cache drops a fetch that a clear overtakes, so a pre-clear read never lands
    this.plexUsers = caches.create({
      max: 1,
      ttl: PLEX_USERS_CACHE_TTL_MS,
      ignoreFetchAbort: true,
      fetchMethod: () => this.fetchPlexUsers(),
    })
    this.sharedServers = caches.create({
      max: 1,
      ttl: PLEX_SHARED_SERVERS_CACHE_TTL_MS,
      ignoreFetchAbort: true,
      fetchMethod: () => this.fetchSharedServerInfo(),
    })
    this.userTokens = caches.create({
      max: PLEX_USER_TOKENS_CACHE_MAX,
      ttl: PLEX_SHARED_SERVERS_CACHE_TTL_MS,
      ignoreFetchAbort: true,
      fetchMethod: (_key, _stale, { context: username }) =>
        this.lookupUserToken(username),
    })
    this.plexResources = caches.create({
      max: 1,
      ignoreFetchAbort: true,
      fetchMethod: async (_key, _stale, { options }) => {
        try {
          return await this.fetchPlexResources()
        } catch (error) {
          this.log.error({ error }, 'Error fetching Plex resources')
          // The empty fallback is kept for the retry gap so a sync waits on plex.tv once
          options.ttl = PLEX_TV_RETRY_GAP_MS
          return []
        }
      },
    })
    this.serverConnectionCache = createServerConnectionCache(
      caches,
      this.deadServerCache,
      this.log,
    )
    this.contentAvailabilityCache = createContentAvailabilityCache(
      caches,
      this.serverConnectionCache,
      this.log,
    )
  }

  private get config() {
    return this.fastify.config
  }

  getServerMachineId(): string | null {
    return this.serverMachineId
  }

  getServerName(): string | null {
    return this.serverName
  }

  getHasPlexPass(): boolean | null {
    return this._hasPlexPass
  }

  setHasPlexPass(value: boolean): void {
    this._hasPlexPass = value
  }

  getAdminPlexId(): number | null {
    return this._adminPlexId
  }

  setAdminPlexId(id: number): void {
    this._adminPlexId = id
  }

  private getProtectionPlaylistName(): string {
    return (
      this.config.plexProtectionPlaylistName || PLEX_PROTECTION_PLAYLIST_DEFAULT
    )
  }

  private initialized = false

  isInitialized(): boolean {
    return this.initialized
  }

  async initialize(): Promise<boolean> {
    try {
      this.log.debug('Initializing PlexServerService connections and users')

      const connections = await this.getPlexServerConnectionInfo()
      if (!connections || connections.length === 0) {
        this.log.error(
          'Failed to initialize PlexServerService because no connections are available',
        )
        this.initialized = false
        return false
      }

      const users = await this.getPlexUsers()
      if (!users || users.length === 0) {
        this.log.warn('No Plex users found during initialization')
      } else {
        this.log.debug(
          `Loaded ${users.length} Plex users during initialization`,
        )
      }

      const serverInfo = await this.getSharedServerInfo()
      if (serverInfo.size === 0) {
        this.log.warn('No shared server info found during initialization')
      } else {
        this.log.debug(
          `Loaded shared server info with ${serverInfo.size} user tokens`,
        )
      }

      this.initialized = true
      return true
    } catch (error) {
      this.log.error({ error }, 'Error initializing PlexServerService:')
      this.initialized = false
      return false
    }
  }

  private get adminToken(): string {
    return this.config.plexTokens?.[0] || ''
  }

  /** The saved server address, or null in automatic mode. */
  private get configuredServerUrl(): string | null {
    return this.config.plexServerUrl || null
  }

  /** Connections to the owner's server, best first, refreshed every 15 minutes. */
  async getPlexServerConnectionInfo(): Promise<PlexServerConnectionInfo[]> {
    if (this.serverConnections && !this.connectionListExpired()) {
      this.log.debug('Using cached Plex server connection info')
      return this.serverConnections
    }
    if (
      this.fallbackConnections &&
      Date.now() - this.negotiationFailedAt < PLEX_TV_RETRY_GAP_MS
    ) {
      return this.fallbackConnections
    }

    const generation = this.cacheGeneration
    const negotiation = await this.negotiateOnce()
    if (generation !== this.cacheGeneration) return negotiation.connections
    if (negotiation.identity) {
      this.serverMachineId = negotiation.identity.machineId
      this.serverName = negotiation.identity.name
    }
    if (!negotiation.settled) {
      this.fallbackConnections = negotiation.connections
      this.negotiationFailedAt = Date.now()
      return negotiation.connections
    }

    this.serverConnections = negotiation.connections
    this.connectionTimestamp = Date.now()
    this.fallbackConnections = null
    this.negotiationFailedAt = 0
    if (
      !this.configuredServerUrl &&
      negotiation.best !== this.selectedConnectionUrl
    ) {
      this.log.debug(
        { previous: this.selectedConnectionUrl, selected: negotiation.best },
        'Selected Plex server connection',
      )
      this.selectedConnectionUrl = negotiation.best
    }
    return negotiation.connections
  }

  /** Concurrent callers share one negotiation instead of each probing plex.tv and the server. */
  private negotiateOnce(): Promise<Negotiation> {
    if (!this.negotiationInFlight) {
      const negotiation = this.negotiateConnections().finally(() => {
        if (this.negotiationInFlight === negotiation) {
          this.negotiationInFlight = null
        }
      })
      this.negotiationInFlight = negotiation
    }
    return this.negotiationInFlight
  }

  private async negotiateConnections(): Promise<Negotiation> {
    const token = this.adminToken
    if (!token) {
      this.log.warn('No Plex admin token available for connection discovery')
      return {
        settled: false,
        connections: this.fallbackConnectionInfo(),
        identity: null,
      }
    }

    let resources: PlexResource[]
    try {
      resources = await getAllPlexResources(token, { ownedOnly: true })
    } catch (error) {
      this.log.error({ error }, 'Error getting Plex server connection info')
      return {
        settled: false,
        connections: this.fallbackConnectionInfo(),
        identity: null,
      }
    }

    const servers = serverCandidates(resources)
    const configured = this.configuredServerUrl
    const matched = configured
      ? servers.find(({ resource }) =>
          resource.connections.some(
            (conn) =>
              isSameServerEndpoint(conn.uri, configured) ||
              isSameServerEndpoint(
                `http://${conn.address}:${conn.port}`,
                configured,
              ),
          ),
        )
      : undefined
    const server = matched ?? servers[0]
    if (!server) {
      this.log.warn('Plex lists no owned Plex Media Server for this account')
      return {
        settled: false,
        connections: this.fallbackConnectionInfo(),
        identity: null,
      }
    }
    if (configured && !matched) {
      this.log.warn(
        `Configured URL "${configured}" matches no discovered connection. Using "${server.resource.name}" for the server identity`,
      )
    }
    warnCandidateFallback(this.log, server)

    const identity = {
      machineId: server.resource.clientIdentifier,
      name: server.resource.name,
    }

    if (configured) {
      const connections = [
        connectionInfo(configured),
        ...server.connections
          .filter((conn) => !isSameServerEndpoint(conn.uri, configured))
          .map((conn) => connectionInfo(conn.uri, conn)),
      ]
      this.log.debug(
        `Discovered ${connections.length} Plex server connections (manual config will be used)`,
      )
      return { settled: true, connections, best: null, identity }
    }

    if (server.connections.length === 0) {
      return {
        settled: false,
        connections: this.fallbackConnectionInfo(),
        identity,
      }
    }

    const ranked = rankProbedConnections(
      await probeConnections(
        server.connections.map((connection) => ({
          ...connection,
          machineId: server.resource.clientIdentifier,
        })),
        this.log,
      ),
    )
    const connections = ranked.map(({ connection }) =>
      connectionInfo(connection.uri, connection),
    )
    const [best] = ranked
    if (!best?.outcome.ok) {
      this.log.warn(
        { server: server.resource.name },
        'Every Plex server connection failed its probe. Retrying on next use',
      )
      return { settled: false, connections, identity }
    }

    this.log.debug(
      `Found ${connections.length} Plex server connections, ${ranked.filter(({ outcome }) => outcome.ok).length} reachable`,
    )
    return { settled: true, connections, best: best.connection.uri, identity }
  }

  /** The last known connections, else the saved address, else the local fallback. */
  private fallbackConnectionInfo(): PlexServerConnectionInfo[] {
    if (this.serverConnections) return this.serverConnections
    return [connectionInfo(this.configuredServerUrl ?? PLEX_FALLBACK_URL)]
  }

  /** The saved address as is, or the negotiated connection in automatic mode. */
  async getPlexServerUrl(): Promise<string> {
    const configured = this.configuredServerUrl
    if (configured) return configured
    if (this.selectedConnectionUrl && !this.connectionListExpired()) {
      return this.selectedConnectionUrl
    }

    const connections = await this.getPlexServerConnectionInfo()
    return (
      this.selectedConnectionUrl ?? connections[0]?.url ?? PLEX_FALLBACK_URL
    )
  }

  private connectionListExpired(): boolean {
    return Date.now() - this.connectionTimestamp >= CONNECTION_LIST_TTL_MS
  }

  /** Drops the negotiated connection, unless it is reachable, so the next call negotiates again. */
  private releaseUnreachableSelection(reachableUrls: string[]): void {
    const selected = this.selectedConnectionUrl
    if (this.configuredServerUrl || !selected) return
    if (reachableUrls.includes(selected)) return
    this.log.warn(
      { url: selected },
      'Selected Plex server connection is unreachable. Negotiating again on next use',
    )
    this.selectedConnectionUrl = null
    this.connectionTimestamp = 0
  }

  async testConnection() {
    const url = await this.getPlexServerUrl()
    const outcome = await probeServerAccess(url, this.adminToken, this.log)
    return {
      ...connectionTestResult(outcome),
      url,
      automatic: this.configuredServerUrl === null,
    }
  }

  discoverServers(plexToken: string) {
    return discoverServerConnections(plexToken, this.log)
  }

  getArrPlexNotificationStatus(): Promise<PlexNotificationOutcome> {
    return getPlexNotificationStatus(this.fastify)
  }

  async configureArrPlexNotifications(
    body: NotificationTargetInput,
  ): Promise<{ kind: 'no-token' } | PlexNotificationOutcome> {
    const target = resolveNotificationTarget(
      body,
      await this.getPlexServerUrl(),
      this.config.plexTokens[0],
    )
    if (!target) return { kind: 'no-token' }
    return configurePlexNotifications(this.fastify, target)
  }

  removeArrPlexNotifications(): Promise<PlexNotificationOutcome> {
    return removePlexNotifications(this.fastify)
  }

  /** Resolves to an empty list when there is no admin token or plex.tv fails, and never caches either. */
  async getPlexUsers(options?: { skipCache?: boolean }): Promise<PlexUser[]> {
    if (!this.config.plexTokens?.[0]) {
      this.log.warn('No Plex admin token available for user operations')
      return []
    }
    try {
      return await this.plexUsers.forceFetch(PLEX_USERS_KEY, {
        forceRefresh: options?.skipCache,
      })
    } catch (error) {
      this.log.error({ error }, 'Error fetching Plex users:')
      return []
    }
  }

  private async fetchPlexUsers(): Promise<PlexUser[]> {
    const plexTvUrl = 'https://plex.tv'
    const adminToken = this.config.plexTokens?.[0] || ''
    const usersUrl = new URL('/api/users', plexTvUrl)
    const usersResponse = await fetch(usersUrl.toString(), {
      headers: {
        'X-Plex-Token': adminToken,
        'X-Plex-Client-Identifier': PLEX_CLIENT_IDENTIFIER,
      },
      signal: AbortSignal.timeout(PLEX_API_TIMEOUT),
    })

    if (!usersResponse.ok) {
      throw new Error(
        `Failed to fetch users: ${usersResponse.status} ${usersResponse.statusText}`,
      )
    }

    const responseText = await usersResponse.text()

    const xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      isArray: (name) => name === 'User' || name === 'Server',
    })

    const parsed = xmlParser.parse(responseText)
    const allUsers = parsed.MediaContainer?.User || []

    this.log.debug(
      `Parsed ${allUsers.length} total users from Plex API response`,
    )

    const users = this.serverMachineId
      ? allUsers.filter(
          (user: { Server?: Array<{ machineIdentifier?: string }> }) => {
            const servers = user.Server || []
            return servers.some(
              (s) => s.machineIdentifier === this.serverMachineId,
            )
          },
        )
      : allUsers

    if (this.serverMachineId && users.length !== allUsers.length) {
      this.log.debug(
        `Filtered to ${users.length} users for server ${this.serverMachineId} (${allUsers.length - users.length} users on other servers excluded)`,
      )
    }

    const formattedUsers = users
      .map(
        (user: {
          id?: string
          username?: string
          title?: string
          email?: string
          thumb?: string
          home?: string | boolean
          restricted?: string | boolean
          protected?: string | boolean
          allowTuners?: string | number
          allowSync?: string | boolean
          allowCameraUpload?: string | boolean
          allowChannels?: string | boolean
          allowSubtitleAdmin?: string | boolean
          filterAll?: string
          filterMovies?: string
          filterMusic?: string
          filterPhotos?: string
          filterTelevision?: string
          Server?: Array<{
            id?: string
            serverId?: string
            machineIdentifier?: string
            name?: string
            lastSeenAt?: string
            numLibraries?: string | number
            allLibraries?: string | boolean
            owned?: string | boolean
            pending?: string | boolean
          }>
        }) => ({
          id: user.id || '',
          username: user.username || user.title || '',
          title: user.title || '',
          email: user.email || '',
          thumb: user.thumb,
          home: xmlBool(user.home),
          restricted: xmlBool(user.restricted),
          protected: xmlBool(user.protected),
          allowTuners:
            user.allowTuners != null ? Number(user.allowTuners) : undefined,
          allowSync: xmlBool(user.allowSync),
          allowCameraUpload: xmlBool(user.allowCameraUpload),
          allowChannels: xmlBool(user.allowChannels),
          allowSubtitleAdmin: xmlBool(user.allowSubtitleAdmin),
          filterAll: user.filterAll || undefined,
          filterMovies: user.filterMovies || undefined,
          filterMusic: user.filterMusic || undefined,
          filterPhotos: user.filterPhotos || undefined,
          filterTelevision: user.filterTelevision || undefined,
          Server: user.Server?.map((s) => ({
            id: s.id || '',
            serverId: s.serverId || '',
            machineIdentifier: s.machineIdentifier || '',
            name: s.name || '',
            lastSeenAt: s.lastSeenAt || '',
            numLibraries: s.numLibraries != null ? Number(s.numLibraries) : 0,
            allLibraries: xmlBool(s.allLibraries) ?? false,
            owned: xmlBool(s.owned) ?? false,
            pending: xmlBool(s.pending) ?? false,
          })),
        }),
      )
      .filter(
        (user: { id: string; title: string; username?: string }) =>
          !!user.id && (!!user.username || !!user.title),
      ) as PlexUser[]

    this.log.debug(`Found ${formattedUsers.length} Plex users`)
    return formattedUsers
  }

  /** Numeric Plex account id for a Pulsarr user, or null when no server user shares its plex_uuid. */
  async resolveUserPlexId(
    user: Pick<User, 'id' | 'plex_uuid'>,
  ): Promise<number | null> {
    const primaryUser = await this.fastify.db.getPrimaryUser()
    if (primaryUser?.id === user.id && this._adminPlexId !== null) {
      return this._adminPlexId
    }
    if (!user.plex_uuid) return null

    const plexUsers = await this.getPlexUsers()
    const match = plexUsers.find(
      (pu) => extractUuidFromThumb(pu.thumb) === user.plex_uuid,
    )
    if (!match) return null

    const numericId = Number(match.id)
    return Number.isNaN(numericId) ? null : numericId
  }

  /** Resolves to an empty map when there is no admin token or plex.tv fails, and never caches either. */
  async getSharedServerInfo(): Promise<Map<string, PlexSharedServerInfo>> {
    if (!this.config.plexTokens?.[0]) {
      this.log.warn(
        'No Plex admin token available for shared server operations',
      )
      return new Map()
    }
    try {
      return await this.sharedServers.forceFetch(SHARED_SERVERS_KEY)
    } catch (error) {
      this.log.error({ error }, 'Error fetching shared server info:')
      return new Map()
    }
  }

  private async fetchSharedServerInfo(): Promise<
    Map<string, PlexSharedServerInfo>
  > {
    const plexTvUrl = 'https://plex.tv'
    const adminToken = this.config.plexTokens?.[0] || ''
    if (!this.serverMachineId) {
      await this.getPlexServerConnectionInfo()
      if (!this.serverMachineId) {
        throw new Error('Could not determine server machine ID')
      }
    }

    const sharedServersUrl = new URL(
      `/api/servers/${this.serverMachineId}/shared_servers`,
      plexTvUrl,
    )

    this.log.debug(
      `Fetching shared server info from ${sharedServersUrl.toString()}`,
    )

    const response = await fetch(sharedServersUrl.toString(), {
      headers: {
        'X-Plex-Token': adminToken,
        'X-Plex-Client-Identifier': PLEX_CLIENT_IDENTIFIER,
        // This endpoint returns XML format
      },
      signal: AbortSignal.timeout(PLEX_API_TIMEOUT),
    })

    if (!response.ok) {
      throw new Error(
        `Failed to fetch shared server info: ${response.status} ${response.statusText}`,
      )
    }

    const responseText = await response.text()

    const serverInfoMap = new Map<string, PlexSharedServerInfo>()

    const xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      isArray: (name) => name === 'SharedServer',
    })

    try {
      const parsed = xmlParser.parse(responseText)
      const sharedServers = parsed.MediaContainer?.SharedServer || []

      this.log.debug(
        `Parsed ${sharedServers.length} shared servers from Plex API response`,
      )

      for (const server of sharedServers) {
        if (server.username && server.accessToken) {
          serverInfoMap.set(server.username, {
            id: server.id || '',
            username: server.username,
            email: server.email || '',
            userID: server.userID || '',
            accessToken: server.accessToken,
          })
        }
      }
    } catch (xmlError) {
      this.log.error({ error: xmlError }, 'Error parsing shared servers XML:')

      this.log.warn('Falling back to regex parsing for shared servers')

      const sharedServerMatches =
        responseText.match(/<SharedServer[^>]*>/g) || []
      this.log.debug(
        `Found ${sharedServerMatches.length} SharedServer entries in XML response`,
      )

      for (const serverMatch of sharedServerMatches) {
        const id = serverMatch.match(/id="([^"]+)"/)?.[1] || ''
        const username = serverMatch.match(/username="([^"]+)"/)?.[1] || ''
        const email = serverMatch.match(/email="([^"]+)"/)?.[1] || ''
        const userID = serverMatch.match(/userID="([^"]+)"/)?.[1] || ''
        const accessToken =
          serverMatch.match(/accessToken="([^"]+)"/)?.[1] || ''

        if (username && accessToken) {
          serverInfoMap.set(username, {
            id,
            username,
            email,
            userID,
            accessToken,
          })
        }
      }
    }

    if (this.serverMachineId && adminToken) {
      const serverOwnerInfo = {
        id: 'owner',
        username: 'owner',
        email: '',
        userID: 'owner',
        accessToken: adminToken,
      }

      serverInfoMap.set('owner', serverOwnerInfo)
      this.log.debug(
        'Added server owner to shared server info with admin token',
      )
    }

    this.log.debug(`Found access tokens for ${serverInfoMap.size} users`)
    return serverInfoMap
  }

  /** Null when the user has no access token, which is never cached. */
  async getUserToken(username: string): Promise<string | null> {
    try {
      const token = await this.userTokens.fetch(username.toLowerCase(), {
        context: username,
      })
      return token ?? null
    } catch (error) {
      this.log.error({ error }, `Error getting token for user "${username}":`)
      return null
    }
  }

  private async lookupUserToken(username: string): Promise<string | undefined> {
    const serverInfoMap = await this.getSharedServerInfo()

    let userInfo: PlexSharedServerInfo | undefined

    userInfo = serverInfoMap.get(username)

    if (!userInfo) {
      for (const [key, info] of serverInfoMap.entries()) {
        if (
          key.toLowerCase() === username.toLowerCase() ||
          info.email.toLowerCase() === username.toLowerCase()
        ) {
          userInfo = info
          break
        }
      }
    }

    if (!userInfo) {
      this.log.warn(`No access token found for user "${username}"`)
      return undefined
    }

    this.log.debug(`Found access token for user "${username}"`)
    return userInfo.accessToken
  }

  async findUserPlaylistByTitle(
    username: string,
    title: string,
  ): Promise<string | null> {
    const serverUrl = await this.getPlexServerUrl()
    const token = await this.getUserToken(username)

    if (!token) {
      this.log.warn(`No token available for user "${username}"`)
      return null
    }

    return findUserPlaylistByTitle(title, serverUrl, token, this.log)
  }

  async createUserPlaylist(
    username: string,
    options: {
      title: string
      type: 'video' | 'audio' | 'photo' | 'mixed'
      smart?: boolean
    },
  ): Promise<string | null> {
    const serverUrl = await this.getPlexServerUrl()
    const token = await this.getUserToken(username)

    if (!token) {
      this.log.warn(`No token available for user "${username}"`)
      return null
    }

    this.log.debug(
      `Creating playlist "${options.title}" for user "${username}"`,
    )

    return createUserPlaylist(options, serverUrl, token, this.log)
  }

  async getOrCreateProtectionPlaylists(
    createIfMissing = true,
  ): Promise<Map<string, string>> {
    if (this.protectedPlaylistsMap) {
      return this.protectedPlaylistsMap
    }

    const playlistMap = new Map<string, string>()

    try {
      const playlistName = this.getProtectionPlaylistName()

      // Get all users (clone to avoid mutating cached array)
      const users = [...(await this.getPlexUsers())]

      const adminToken = this.config.plexTokens?.[0]
      if (adminToken) {
        const hasOwner = users.some(
          (user) =>
            user.username.toLowerCase() === 'owner' ||
            user.username.toLowerCase() === 'admin',
        )

        if (!hasOwner) {
          this.log.debug(
            'Adding admin/owner user to the protection playlist creation list',
          )
          users.push({
            id: 'owner',
            username: 'owner',
            title: 'Owner',
            email: '',
          })
        }
      }

      this.log.debug(`Checking protection playlists for ${users.length} users`)

      for (const user of users) {
        try {
          const existingPlaylistId = await this.findUserPlaylistByTitle(
            user.username,
            playlistName,
          )

          if (existingPlaylistId) {
            this.log.debug(
              `Found existing "${playlistName}" playlist for user "${user.username}" with ID: ${existingPlaylistId}`,
            )
            playlistMap.set(user.username, existingPlaylistId)
            continue
          }

          if (createIfMissing) {
            const newPlaylistId = await this.createUserPlaylist(user.username, {
              title: playlistName,
              type: 'mixed',
              smart: false,
            })

            if (newPlaylistId) {
              this.log.info(
                `Created "${playlistName}" playlist for user "${user.username}" with ID: ${newPlaylistId}`,
              )
              playlistMap.set(user.username, newPlaylistId)
            } else {
              this.log.warn(
                `Failed to create "${playlistName}" playlist for user "${user.username}"`,
              )
            }
          } else {
            this.log.debug(
              `No "${playlistName}" playlist found for user "${user.username}" and creation is disabled`,
            )
          }
        } catch (error) {
          this.log.error(
            { error },
            `Error processing protection playlist for user "${user.username}":`,
          )
        }
      }

      this.log.debug(
        `Successfully processed protection playlists for ${playlistMap.size} of ${users.length} users`,
      )

      this.protectedPlaylistsMap = playlistMap

      return playlistMap
    } catch (error) {
      this.log.error({ error }, 'Error in getOrCreateProtectionPlaylists:')
      return playlistMap
    }
  }

  async getUserPlaylistItems(
    username: string,
    playlistId: string,
  ): Promise<Set<PlexPlaylistItem>> {
    const serverUrl = await this.getPlexServerUrl()
    const token = await this.getUserToken(username)

    if (!token) {
      this.log.warn(`No token available for user "${username}"`)
      return new Set()
    }

    return getUserPlaylistItems(playlistId, serverUrl, token, this.log)
  }

  async getProtectedItems(): Promise<Set<string>> {
    if (this.protectedItemsCache) {
      this.log.debug('Using cached protected items from current workflow')
      return this.protectedItemsCache
    }

    const protectedGuids = new Set<string>()

    const playlistName = this.getProtectionPlaylistName()

    if (!this.config.enablePlexPlaylistProtection) {
      this.log.debug('Plex playlist protection is disabled')
      return protectedGuids
    }

    try {
      const userPlaylists = await this.getOrCreateProtectionPlaylists(true)

      // Plex has revoked token access when shared users exist but none got through
      const sharedUserCount = (await this.getPlexUsers()).length
      const nonOwnerPlaylists = [...userPlaylists.keys()].filter(
        (u) => u !== 'owner',
      )
      if (sharedUserCount > 0 && nonOwnerPlaylists.length === 0) {
        throw new Error(
          'Plex has removed shared user access tokens, so playlist protection cannot function. Delete sync aborted to prevent content loss. Disable playlist protection to resume delete sync.',
        )
      }

      for (const [username, playlistId] of userPlaylists.entries()) {
        try {
          const playlistItems = await this.getUserPlaylistItems(
            username,
            playlistId,
          )

          if (playlistItems.size === 0) {
            this.log.debug(
              `Protection playlist for user "${username}" is empty`,
            )
            continue
          }

          this.log.debug(
            `Processing ${playlistItems.size} protected items from playlist "${playlistName}" for user "${username}"`,
          )

          for (const item of playlistItems) {
            try {
              const itemMetadata = await this.getItemMetadata(
                username,
                item.guid,
                item.grandparentGuid,
                item.type,
              )

              if (itemMetadata?.guids && itemMetadata.guids.length > 0) {
                for (const guid of itemMetadata.guids) {
                  protectedGuids.add(guid)
                  this.log.debug(
                    `Protected item GUID: "${guid}" (${item.title})`,
                  )
                }

                this.log.debug(
                  `Added protected item "${item.title}" with ${itemMetadata.guids.length} GUIDs from user "${username}"`,
                )
              } else {
                this.log.warn(
                  `Failed to retrieve standardized GUIDs for protected item "${item.title}", so the item may not be properly protected`,
                )
              }
            } catch (itemError) {
              this.log.error(
                { error: itemError },
                `Error processing protected item "${item.title}":`,
              )
            }
          }

          this.log.debug(
            `Processed ${playlistItems.size} protected items from user "${username}"`,
          )
        } catch (error) {
          this.log.error(
            { error },
            `Error processing protected items for user "${username}":`,
          )
        }
      }

      this.log.debug(
        `Found a total of ${protectedGuids.size} unique protected GUIDs across all users`,
      )

      if (
        protectedGuids.size > 0 &&
        (this.log.level === 'debug' || this.log.level === 'trace')
      ) {
        const sampleGuids = Array.from(protectedGuids).slice(0, 5)
        this.log.debug('Sample protected GUIDs:')
        for (const guid of sampleGuids) {
          this.log.debug(`  Protected GUID: "${guid}"`)
        }
      }

      this.protectedItemsCache = protectedGuids
      this.log.debug(
        `Cached ${protectedGuids.size} protected GUIDs for current workflow`,
      )

      return protectedGuids
    } catch (error) {
      this.log.error(
        { error },
        'Error getting protected items from user playlists:',
      )
      // Rethrow so delete sync aborts rather than proceeding unprotected
      throw error
    }
  }

  async getItemMetadata(
    _username: string,
    plexGuid: string,
    grandparentGuid?: string,
    itemType?: string,
  ): Promise<{ title: string; guids: string[] } | null> {
    try {
      const guidToUse =
        itemType === 'episode' && grandparentGuid ? grandparentGuid : plexGuid

      const mediaId = guidToUse.split(/[/:]/).pop()
      if (!mediaId) {
        this.log.warn(`Invalid Plex GUID format: "${guidToUse}"`)
        return null
      }

      const contentType = guidToUse.includes('/movie/')
        ? 'movie'
        : guidToUse.includes('/show/')
          ? 'show'
          : itemType || (plexGuid.includes('/episode/') ? 'show' : 'movie')

      const tempItem = {
        id: mediaId,
        key: mediaId,
        title: itemType === 'episode' ? 'TV Episode' : 'Protected Item',
        type: contentType,
        user_id: 0,
        status: 'pending' as const,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        guids: [],
        genres: [],
      }

      const itemSet = await toItemsSingle(this.config, this.log, tempItem, 0, 3)

      const items = Array.from(itemSet)
      if (items.length === 0) {
        this.log.warn('No metadata found for item')
        return null
      }

      const item = items[0] as Item

      const extractedGuids = Array.isArray(item.guids)
        ? item.guids
        : typeof item.guids === 'string'
          ? parseGuids(item.guids)
          : []

      if (extractedGuids.length > 0) {
        this.log.debug(
          `Found ${extractedGuids.length} GUIDs for item "${item.title || 'Unknown'}"`,
        )
      } else {
        this.log.warn(
          `No standardized GUIDs found for item "${item.title || 'Unknown'}"`,
        )
      }

      return {
        title: item.title || `Unknown ${itemType || 'item'}`,
        guids: extractedGuids,
      }
    } catch (error) {
      this.log.error({ error }, 'Error getting metadata for item')
      return null
    }
  }

  async isItemProtected(
    itemGuids: string[] | string | undefined,
    itemTitle?: string,
  ): Promise<boolean> {
    if (!this.config.enablePlexPlaylistProtection) {
      this.log.debug(
        'Plex playlist protection is disabled, skipping protection check',
      )
      return false
    }

    if (
      !itemGuids ||
      (Array.isArray(itemGuids) && itemGuids.length === 0) ||
      (typeof itemGuids === 'string' && !itemGuids.trim())
    ) {
      this.log.warn(
        `No GUIDs provided to protection check${itemTitle ? ` for "${itemTitle}"` : ''}`,
      )
      return false
    }

    const protectedGuids = await this.getProtectedItems()
    if (protectedGuids.size === 0) {
      this.log.debug('No protected items found in any user playlist')
      return false
    }

    const parsedGuids = parseGuids(itemGuids)
    if (parsedGuids.length === 0) {
      this.log.warn(
        `No valid GUIDs found in input for item${itemTitle ? ` "${itemTitle}"` : ''}`,
      )
      return false
    }

    for (const guid of parsedGuids) {
      if (protectedGuids.has(guid)) {
        this.log.debug(
          `Item${itemTitle ? ` "${itemTitle}"` : ''} is protected with matching GUID: "${guid}"`,
        )
        return true
      }
    }

    if (this.log.level === 'debug' || this.log.level === 'trace') {
      this.log.debug(
        `Item${itemTitle ? ` "${itemTitle}"` : ''} with GUIDs [${parsedGuids.join(', ')}] is not protected`,
      )
    }
    return false
  }

  clearCaches(resetInitialized = false): void {
    this.log.debug('Clearing all PlexServerService caches')
    this._hasPlexPass = null
    this._adminPlexId = null
    this.clearConnectionCaches()

    if (resetInitialized) {
      this.log.warn('Resetting Plex server initialization state')
      this.initialized = false
    }
  }

  /** Clears everything tied to the server address but keeps account facts such as Plex Pass, which only change with the token. */
  clearConnectionCaches(): void {
    this.serverConnections = null
    this.serverMachineId = null
    this.serverName = null
    this.connectionTimestamp = 0
    this.selectedConnectionUrl = null
    this.fallbackConnections = null
    this.negotiationFailedAt = 0
    this.negotiationInFlight = null
    this.cacheGeneration += 1
    this.plexUsers.clear()
    this.userTokens.clear()
    this.protectedPlaylistsMap = null
    this.protectedItemsCache = null
    this.sharedServers.clear()
    this.plexResources.clear()

    this.serverConnectionCache.clear()
    this.contentAvailabilityCache.clear()
    this.deadServerCache.clear()
  }

  async connectSSE(): Promise<void> {
    const serverUrl = await this.getPlexServerUrl()
    const token = this.config.plexTokens?.[0] || ''

    if (!token) {
      this.log.warn('No Plex token available, skipping SSE connection')
      return
    }

    this.sessionTracker = new SessionTracker(this.log)
    this.timelineDebouncer = new TimelineDebouncer()

    this.eventSource = new PlexEventSource({
      serverUrl,
      token,
      logger: this.log,
    })

    this.eventSource.on('timeline', (entries) => {
      this.timelineDebouncer?.handleTimelineEntries(entries)
    })

    this.eventSource.on('connected', () => {
      this.log.info(
        { url: serverUrl },
        `Connected to Plex server ${this.serverName ?? serverUrl}`,
      )
      void this.reconcileSessionsOnConnect()
    })

    this.eventSource.on('disconnected', () => {
      this.log.warn('SSE disconnected, polling continues as fallback')
    })

    this.staleSweepInterval = setInterval(() => {
      if (this.sessionTracker) {
        const stale = this.sessionTracker.sweepStale(
          PlexServerService.STALE_SESSION_MS,
        )
        if (stale.length > 0) {
          this.log.debug(
            { count: stale.length },
            'Swept stale sessions from SSE tracker',
          )
        }
      }
    }, PlexServerService.STALE_SWEEP_INTERVAL_MS)

    await this.eventSource.connect()
  }

  disconnectSSE(): void {
    if (this.staleSweepInterval) {
      clearInterval(this.staleSweepInterval)
      this.staleSweepInterval = null
    }
    if (this.timelineDebouncer) {
      this.timelineDebouncer.destroy()
      this.timelineDebouncer = null
    }
    if (this.eventSource) {
      this.eventSource.disconnect()
      this.eventSource.removeAllListeners()
      this.eventSource = null
    }
    if (this.sessionTracker) {
      this.sessionTracker.clear()
      this.sessionTracker = null
    }
  }

  onSSE<K extends keyof PlexSSEEventMap>(
    event: K,
    handler: (...args: PlexSSEEventMap[K]) => void,
  ): void {
    this.eventSource?.on(event, handler)
  }

  isSSEConnected(): boolean {
    return this.eventSource?.isConnected() ?? false
  }

  offSSE<K extends keyof PlexSSEEventMap>(
    event: K,
    handler: (...args: PlexSSEEventMap[K]) => void,
  ): void {
    this.eventSource?.off(event, handler)
  }

  getSessionTracker(): SessionTracker | null {
    return this.sessionTracker
  }

  // Fires after a 2-second quiet period following state-5 timeline entries
  onContentScanned(handler: ContentScannedHandler): void {
    this.timelineDebouncer?.onContentScanned(handler)
  }

  // Drop pre-disconnect entries so recycled session keys after a Plex restart fire again, then seed live sessions
  private async reconcileSessionsOnConnect(): Promise<void> {
    try {
      this.sessionTracker?.clear()
      const liveSessions = await this.getActiveSessions()
      if (liveSessions.length === 0) return

      const added = this.sessionTracker?.hydrate(liveSessions) ?? 0
      if (added > 0) {
        this.log.debug(
          { total: liveSessions.length, added },
          'Hydrated session tracker from live sessions on SSE connect',
        )
      }
    } catch (error) {
      this.log.warn({ error }, 'Failed to reconcile sessions on SSE connect')
    }
  }

  clearWorkflowCaches(): void {
    this.log.debug('Clearing workflow-specific caches')
    this.protectedPlaylistsMap = null
    this.protectedItemsCache = null
  }

  clearPlexResourcesCache(): void {
    this.plexResources.clear()
    this.log.debug('Cleared Plex resources cache')
  }

  /** Drops the plex.tv users list and shared server info, so a friend change shows on the next read. */
  clearFriendCaches(): void {
    this.plexUsers.clear()
    this.sharedServers.clear()
  }

  clearUserToken(username: string): void {
    this.userTokens.delete(username.toLowerCase())
  }

  private fetchPlexResources(): Promise<PlexResource[]> {
    this.log.debug('Server resources cache miss, fetching from plex.tv API')
    return getAllPlexResources(this.config.plexTokens?.[0] || '')
  }

  async getActiveSessions(): Promise<PlexSession[]> {
    const serverUrl = await this.getPlexServerUrl()
    const token = this.config.plexTokens?.[0] || ''
    return getActiveSessions(serverUrl, token, this.log)
  }

  async getShowMetadata(
    ratingKey: string,
    includeChildren: true,
  ): Promise<PlexShowMetadata | null>
  async getShowMetadata(
    ratingKey: string,
    includeChildren: false,
  ): Promise<PlexShowMetadataResponse | null>
  async getShowMetadata(
    ratingKey: string,
    includeChildren = true,
  ): Promise<PlexShowMetadata | PlexShowMetadataResponse | null> {
    const serverUrl = await this.getPlexServerUrl()
    const token = this.config.plexTokens?.[0] || ''
    return getShowMetadata(
      ratingKey,
      includeChildren,
      serverUrl,
      token,
      this.log,
    )
  }

  async searchByGuid(guid: string): Promise<PlexMetadata[]> {
    const serverUrl = await this.getPlexServerUrl()
    const token = this.config.plexTokens?.[0] || ''
    return searchByGuid(guid, serverUrl, token, this.log)
  }

  async lookupByGuid(guid: string): Promise<GuidLookup> {
    const serverUrl = await this.getPlexServerUrl()
    const token = this.config.plexTokens?.[0] || ''
    return lookupByGuid(guid, serverUrl, token, this.log)
  }

  async getMetadataChildren(
    ratingKey: string,
  ): Promise<PlexChildrenResponse | null> {
    const serverUrl = await this.getPlexServerUrl()
    const token = this.config.plexTokens?.[0] || ''
    return getMetadataChildren(ratingKey, serverUrl, token, this.log)
  }

  clearContentCacheForReconciliation(): void {
    const previousSize = this.contentAvailabilityCache.size
    this.contentAvailabilityCache.clear()
    if (previousSize > 0) {
      this.log.debug(
        `Cleared ${previousSize} content cache entries for new reconciliation`,
      )
    }
  }

  // A down primary server makes 'not found' untrustworthy, so callers must abort to prevent mass-routing
  async checkPlexServerHealth(): Promise<{
    reachable: boolean
    serverName: string | null
  }> {
    try {
      const ownerConnections = await this.getPlexServerConnectionInfo()

      if (ownerConnections.length === 0) {
        this.log.warn('No owner server connections available for health check')
        return { reachable: false, serverName: this.serverName }
      }

      const reachable = await testConnectionReachability(
        ownerConnections.map((c) => ({ uri: c.url })),
        this.log,
      )
      this.releaseUnreachableSelection(reachable.map(({ uri }) => uri))

      if (reachable.length === 0) {
        this.log.warn(
          { serverName: this.serverName },
          'Plex server health check failed because no connections are reachable',
        )
        return { reachable: false, serverName: this.serverName }
      }

      // /identity is up during startup while library queries return empty, so probe /library/sections
      const token = this.config.plexTokens?.[0] || ''
      const serverUri = reachable[0].uri
      const libraryReady = await this.waitForLibraryReady(serverUri, token)

      if (!libraryReady) {
        this.log.warn(
          { serverName: this.serverName },
          'Plex server is reachable but library is not ready (maintenance or still starting)',
        )
        return { reachable: false, serverName: this.serverName }
      }

      this.log.debug(
        { serverName: this.serverName, reachableCount: reachable.length },
        'Plex server health check passed',
      )
      return { reachable: true, serverName: this.serverName }
    } catch (error) {
      this.log.error(
        { error, serverName: this.serverName },
        'Error during Plex server health check',
      )
      return { reachable: false, serverName: this.serverName }
    }
  }

  // Plex returns 503 during startup maintenance, and empty library results look like missing content
  private async waitForLibraryReady(
    serverUri: string,
    token: string,
    maxAttempts = 12,
    intervalMs = 5000,
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(`${serverUri}/library/sections`, {
          headers: {
            Accept: 'application/json',
            'X-Plex-Token': token,
            'X-Plex-Client-Identifier': PLEX_CLIENT_IDENTIFIER,
          },
          signal: AbortSignal.timeout(5000),
        })

        if (response.status === 503) {
          this.log.info(
            { attempt, maxAttempts, serverName: this.serverName },
            'Plex server in maintenance mode, waiting for library to become ready',
          )
          await new Promise((resolve) => setTimeout(resolve, intervalMs))
          continue
        }

        if (response.status === 401 || response.status === 403) {
          this.log.error(
            { status: response.status, serverName: this.serverName },
            'Plex library probe failed due to invalid or unauthorized token',
          )
          return false
        }

        if (!response.ok) {
          this.log.warn(
            { status: response.status, attempt },
            'Unexpected response from /library/sections',
          )
          await new Promise((resolve) => setTimeout(resolve, intervalMs))
          continue
        }

        const data = (await response.json()) as {
          MediaContainer?: { Directory?: Array<{ key: string }> }
        }

        const sections = data?.MediaContainer?.Directory ?? []
        if (sections.length > 0) {
          if (attempt > 1) {
            this.log.info(
              { attempt, sectionCount: sections.length },
              'Plex library is now ready',
            )
          }
          return true
        }

        this.log.info(
          { attempt, maxAttempts },
          'Plex returned no library sections, waiting for library to load',
        )
        await new Promise((resolve) => setTimeout(resolve, intervalMs))
      } catch (error) {
        this.log.debug(
          { error, attempt, maxAttempts },
          'Error probing /library/sections',
        )
        await new Promise((resolve) => setTimeout(resolve, intervalMs))
      }
    }

    return false
  }

  async checkExistenceAcrossServers(
    plexKey: string | undefined,
    contentType: 'movie' | 'show',
    isPrimaryUser: boolean,
  ): Promise<boolean> {
    if (!plexKey) {
      this.log.debug('No Plex key provided for existence check')
      return false
    }

    try {
      const adminToken = this.config.plexTokens?.[0] || ''

      if (!adminToken) {
        this.log.warn(
          'No Plex admin token available for multi-server existence check',
        )
        return false
      }

      const allResources =
        await this.plexResources.forceFetch(PLEX_RESOURCES_KEY)

      const ownerConnections = await this.getPlexServerConnectionInfo()

      const serversToCheck = buildUniqueServerList(
        ownerConnections,
        allResources,
        adminToken,
        isPrimaryUser,
        { logger: this.log, serverMachineId: this.serverMachineId },
      )

      if (serversToCheck.length === 0) {
        this.log.debug('No Plex servers found for existence check')
        return false
      }

      const plexGuid = buildPlexGuid(contentType, plexKey)

      this.log.debug(
        {
          plexKey,
          contentType,
          plexGuid,
          serverCount: serversToCheck.length,
        },
        'Checking content existence across Plex servers',
      )

      const connectionCacheDeps = {
        logger: this.log,
        deadServerBackoff: this.DEAD_SERVER_BACKOFF,
      }

      const abortController = new AbortController()

      const serverChecks = serversToCheck.map(async (server) => {
        const connection = await getBestServerConnection(
          server.clientIdentifier,
          {
            serverName: server.name,
            connections: server.connections,
            accessToken: server.accessToken,
          },
          this.serverConnectionCache,
          this.deadServerCache,
          connectionCacheDeps,
        )

        if (!connection) {
          this.log.debug(
            `No working connection for server "${server.name}", skipping`,
          )
          return { server: server.name, found: false }
        }

        const found = await checkContentOnServer(
          this.contentAvailabilityCache,
          {
            serverClientId: server.clientIdentifier,
            serverName: server.name,
            serverUri: connection.uri,
            accessToken: connection.accessToken,
            contentType,
            plexGuid,
            signal: abortController.signal,
          },
        )

        if (found) {
          this.log.debug(
            `Content found on Plex server "${server.name}", skipping download`,
          )
          abortController.abort()
        }

        return { server: server.name, found }
      })

      const results = await Promise.allSettled(serverChecks)

      const foundOnAnyServer = results.some(
        (result) => result.status === 'fulfilled' && result.value.found,
      )

      if (!foundOnAnyServer) {
        this.log.debug('Content not found on any accessible Plex server')
      }

      return foundOnAnyServer
    } catch (error) {
      this.log.error(
        { error, plexKey, contentType },
        'Error checking Plex servers for content existence',
      )
      // On error, return false to allow download (fail open)
      return false
    }
  }

  async getMetadata(ratingKey: string): Promise<PlexMetadata | null> {
    const serverUrl = await this.getPlexServerUrl()
    const token = this.config.plexTokens?.[0] || ''
    return getMetadata(ratingKey, serverUrl, token, this.log)
  }

  async lookupMetadata(ratingKey: string): Promise<MetadataLookup> {
    const serverUrl = await this.getPlexServerUrl()
    const token = this.config.plexTokens?.[0] || ''
    return lookupMetadata(ratingKey, serverUrl, token, this.log)
  }

  async getCurrentLabels(ratingKey: string): Promise<string[] | null> {
    const serverUrl = await this.getPlexServerUrl()
    const token = this.config.plexTokens?.[0] || ''
    return getCurrentLabels(ratingKey, serverUrl, token, this.log)
  }

  async removeSpecificLabels(
    ratingKey: string,
    labelsToRemove: string[],
  ): Promise<boolean> {
    const serverUrl = await this.getPlexServerUrl()
    const token = this.config.plexTokens?.[0] || ''
    return removeSpecificLabels(
      ratingKey,
      labelsToRemove,
      serverUrl,
      token,
      this.log,
    )
  }

  async updateLabels(ratingKey: string, labels: string[]): Promise<boolean> {
    const serverUrl = await this.getPlexServerUrl()
    const token = this.config.plexTokens?.[0] || ''
    return updateLabels(ratingKey, labels, serverUrl, token, this.log)
  }
}
