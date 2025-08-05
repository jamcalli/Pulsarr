/**
 * Plex Server Service
 *
 * A stateful service class for interacting with Plex Media Server.
 * Provides connection management, user operations, and playlist protection functionality.
 */
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { parseGuids, normalizeGuid } from '@utils/guid-handler.js'
import { toItemsSingle } from '@utils/plex.js'
import type { Item } from '@root/types/plex.types.js'
import { XMLParser } from 'fast-xml-parser'
import type {
  PlexSession,
  PlexSessionResponse,
  PlexShowMetadata,
  PlexShowMetadataResponse,
} from '@root/types/plex-session.types.js'

/**
 * Specialized Plex playlist response structure
 */
interface PlexPlaylistResponse {
  MediaContainer: {
    size?: number
    Metadata: Array<{
      ratingKey: string
      key: string
      guid: string
      type: string
      title: string
      summary?: string
      smart?: boolean
      playlistType?: string
    }>
  }
}

/**
 * Specialized Plex playlist items response structure
 */
interface PlexPlaylistItemsResponse {
  MediaContainer: {
    size: number
    offset?: number
    totalSize?: number
    Metadata: Array<{
      ratingKey: string
      key: string
      guid: string
      type: string
      title: string
      grandparentTitle?: string
      grandparentGuid?: string
      parentGuid?: string
      parentRatingKey?: string
      grandparentRatingKey?: string
    }>
  }
}

/**
 * Simplified Plex playlist item for protection checks
 */
export interface PlexPlaylistItem {
  guid: string // Full format: "plex://movie/5d776832a091de001f2e780f" or "plex://episode/5ea3e26f382f910042f103d0"
  grandparentGuid?: string // For TV shows: "plex://show/5eb6b5ffac1f29003f4a737b"
  parentGuid?: string // For TV episodes: "plex://season/602e7aa091bd55002cf9cc73"
  type: string // "movie", "show", "episode"
  title: string // For logging only
}

/**
 * Connection details for a Plex server
 */
export interface PlexServerConnectionInfo {
  url: string
  local: boolean
  relay: boolean
  isDefault: boolean
}

/**
 * Plex user information
 */
interface PlexUser {
  id: string
  username: string
  title: string
  email?: string
}

/**
 * Plex shared server information with user access tokens
 */
interface PlexSharedServerInfo {
  id: string
  username: string
  email: string
  userID: string
  accessToken: string
  // Other fields available but not needed for our primary use case
}

/**
 * Plex API Resource interface for server identification
 * Based on the actual response from /api/v2/resources endpoint
 */
interface PlexResource {
  name: string
  product: string
  productVersion: string
  platform: string
  platformVersion: string
  device: string
  clientIdentifier: string
  createdAt: string
  lastSeenAt: string
  provides: string
  ownerId: string | null
  sourceTitle: string | null
  publicAddress: string
  accessToken: string
  owned: boolean
  home: boolean
  synced: boolean
  relay: boolean
  presence: boolean
  httpsRequired: boolean
  publicAddressMatches: boolean
  dnsRebindingProtection: boolean
  natLoopbackSupported: boolean
  connections: Array<{
    protocol: string
    address: string
    port: number
    uri: string
    local: boolean
    relay: boolean
    IPv6: boolean
  }>
}

/**
 * Plex metadata item structure
 */
interface PlexMetadata {
  ratingKey: string
  key: string
  guid: string
  type: string
  title: string
  summary?: string
  year?: number
  thumb?: string
  art?: string
  originalTitle?: string
  contentRating?: string
  studio?: string
  tagline?: string
  addedAt?: number
  updatedAt?: number
  duration?: number
  librarySectionTitle?: string
  librarySectionID?: number
  librarySectionKey?: string
  Guid?: Array<{ id: string }>
  Genre?: Array<{ tag: string }>
  Label?: Array<{ tag: string }>
  // Media information for movies and shows
  Media?: Array<{
    Part?: Array<{
      file?: string
    }>
  }>
  // Location information for shows/movies
  Location?: Array<{
    path: string
  }>
  // Add other fields as needed
}

/**
 * Plex search response structure for /library/all endpoint
 */
interface PlexSearchResponse {
  MediaContainer: {
    size?: number
    totalSize?: number
    offset?: number
    Metadata?: PlexMetadata[]
  }
}

/**
 * Plex metadata response structure for /library/metadata/{ratingKey} endpoint
 */
interface PlexMetadataResponse {
  MediaContainer: {
    size: number
    allowSync?: boolean
    identifier?: string
    librarySectionID?: number
    librarySectionTitle?: string
    librarySectionUUID?: string
    mediaTagPrefix?: string
    mediaTagVersion?: number
    Metadata?: PlexMetadata[]
  }
}

/**
 * PlexServerService class for maintaining state and providing Plex operations
 */
export class PlexServerService {
  // Connection and server information cache
  private serverConnections: PlexServerConnectionInfo[] | null = null
  private serverMachineId: string | null = null
  private connectionTimestamp = 0
  private selectedConnectionUrl: string | null = null // Track which URL we've selected

  // User-related cache
  private users: PlexUser[] | null = null
  private usersTimestamp = 0
  private userTokens: Map<string, { token: string; timestamp: number }> =
    new Map()
  private sharedServerInfo: Map<string, PlexSharedServerInfo> | null = null
  private sharedServerInfoTimestamp = 0

  // Playlist and protection workflow cache
  // These are intended to be used within a single workflow execution
  private protectedPlaylistsMap: Map<string, string> | null = null
  private protectedItemsCache: Set<string> | null = null

  /**
   * Creates a new PlexServerService instance
   *
   * @param log - Fastify logger instance
   * @param fastify - Fastify instance for accessing configuration
   */
  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {
    this.log.info('Initializing PlexServerService')
  }

  /**
   * Access to application configuration
   */
  private get config() {
    return this.fastify.config
  }

  /**
   * Retrieves the configured protection playlist name or returns default
   *
   * @returns The playlist name used for content protection
   */
  private getProtectionPlaylistName(): string {
    return this.config.plexProtectionPlaylistName || 'Do Not Delete'
  }

  // Track initialization state
  private initialized = false

  /**
   * Check if the service has been properly initialized
   *
   * @returns true if service is initialized, false otherwise
   */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * Initializes the service by loading connections and users
   * Called during application startup to prepare the service
   *
   * @returns Promise that resolves to true if initialization succeeded, false otherwise
   */
  async initialize(): Promise<boolean> {
    try {
      this.log.info('Initializing PlexServerService connections and users')

      // Load server connections
      const connections = await this.getPlexServerConnectionInfo()
      if (!connections || connections.length === 0) {
        this.log.error(
          'Failed to initialize PlexServerService - no connections available',
        )
        this.initialized = false
        return false
      }

      // Load users
      const users = await this.getPlexUsers()
      if (!users || users.length === 0) {
        this.log.warn('No Plex users found during initialization')
      } else {
        this.log.info(`Loaded ${users.length} Plex users during initialization`)
      }

      // Load shared server info to get user tokens
      const serverInfo = await this.getSharedServerInfo()
      if (serverInfo.size === 0) {
        this.log.warn('No shared server info found during initialization')
      } else {
        this.log.info(
          `Loaded shared server info with ${serverInfo.size} user tokens`,
        )
      }

      this.initialized = true
      return true
    } catch (error) {
      this.log.error('Error initializing PlexServerService:', error)
      this.initialized = false
      return false
    }
  }

  /**
   * Retrieves and prioritizes Plex server connection details
   * Uses caching for performance optimization
   *
   * @returns Promise resolving to array of connection configurations
   */
  async getPlexServerConnectionInfo(): Promise<PlexServerConnectionInfo[]> {
    try {
      // Use cached connection data if valid (less than 15 minutes old)
      if (
        this.serverConnections &&
        Date.now() - this.connectionTimestamp < 15 * 60 * 1000
      ) {
        this.log.debug('Using cached Plex server connection info')
        return this.serverConnections
      }

      const plexTvUrl = 'https://plex.tv'
      const adminToken = this.config.plexTokens?.[0] || ''

      if (!adminToken) {
        this.log.warn('No Plex admin token available for connection discovery')
        return this.getDefaultConnectionInfo()
      }

      // Retrieve server resources from Plex.tv API
      const resourcesUrl = new URL('/api/v2/resources', plexTvUrl)
      const resourcesResponse = await fetch(resourcesUrl.toString(), {
        headers: {
          Accept: 'application/json',
          'X-Plex-Token': adminToken,
          'X-Plex-Client-Identifier': 'Pulsarr',
        },
        signal: AbortSignal.timeout(8000),
      })

      if (!resourcesResponse.ok) {
        throw new Error(
          `Failed to fetch resources: ${resourcesResponse.status} ${resourcesResponse.statusText}`,
        )
      }

      const resourcesData = (await resourcesResponse.json()) as PlexResource[]
      const server = resourcesData.find(
        (r) => r.product === 'Plex Media Server',
      )

      if (!server || !server.connections || server.connections.length === 0) {
        this.log.warn('No Plex server connections found, using default')
        return this.getDefaultConnectionInfo()
      }

      // Extract and categorize connections by priority
      const connections: PlexServerConnectionInfo[] = []

      // Collect all available connections
      for (const conn of server.connections) {
        connections.push({
          url: conn.uri,
          local: conn.local,
          relay: conn.relay,
          isDefault: false,
        })
      }

      // Sort connections by priority: local first, then non-relay, then relay
      connections.sort((a, b) => {
        // Local connections first
        if (a.local && !b.local) return -1
        if (!a.local && b.local) return 1

        // Non-relay connections second
        if (!a.relay && b.relay) return -1
        if (a.relay && !b.relay) return 1

        return 0
      })

      // Mark the first one as default
      if (connections.length > 0) {
        connections[0].isDefault = true
      }

      // Check for manually configured URL that's not the default value
      const configUrl = this.config.plexServerUrl
      const defaultUrl = 'http://localhost:32400'

      // Only use the URL if it's configured and not the default value
      if (configUrl && configUrl !== defaultUrl) {
        this.log.info(`Found manually configured Plex URL: ${configUrl}`)

        // Try to match with discovered connections
        const configMatch = connections.find(
          (c) =>
            c.url === configUrl ||
            c.url.replace('http://', '').replace('https://', '') ===
              configUrl.replace('http://', '').replace('https://', ''),
        )

        if (configMatch) {
          // Mark manually configured URL as default
          for (const c of connections) {
            c.isDefault = false
          }
          configMatch.isDefault = true
          this.log.info(
            'Manually configured URL matches a discovered connection - setting as default',
          )
        } else {
          // Add manually configured URL as override
          connections.push({
            url: configUrl,
            local: false, // Can't determine if it's local without discovery
            relay: false,
            isDefault: true, // Override auto-discovery
          })

          // Mark all auto-discovered connections as non-default
          for (let i = 0; i < connections.length - 1; i++) {
            connections[i].isDefault = false
          }

          this.log.info(
            'Manually configured URL does not match any discovered connection - adding as override',
          )
        }
      } else {
        this.log.debug(
          'Using auto-discovered Plex connections (no manual override)',
        )
      }

      // Cache the result
      this.serverConnections = connections
      this.connectionTimestamp = Date.now()
      this.serverMachineId = server.clientIdentifier

      this.log.info(
        `Found ${connections.length} Plex server connections (${connections.filter((c) => c.local).length} local, ${connections.filter((c) => c.relay).length} relay)`,
      )

      // Log connection details at info level for clear auto-configuration visibility
      if (connections.length > 0) {
        this.log.info('Available Plex connections:')
        for (const [index, conn] of connections.entries()) {
          this.log.info(
            `Connection ${index + 1}: URL=${conn.url}, Local=${conn.local}, Relay=${conn.relay}, Default=${conn.isDefault}`,
          )
        }
      }

      return connections
    } catch (error) {
      this.log.error('Error getting Plex server connection info:', error)
      return this.getDefaultConnectionInfo()
    }
  }

  /**
   * Returns a default connection configuration using the config value or localhost
   *
   * @returns Array containing a single default connection configuration
   */
  private getDefaultConnectionInfo(): PlexServerConnectionInfo[] {
    // Check if there's a manually configured URL that's not the default
    const configUrl = this.config.plexServerUrl
    const defaultUrl = 'http://localhost:32400'

    // Only use the configured URL if it's provided and not the default value
    if (configUrl && configUrl !== defaultUrl) {
      this.log.info(
        `Using manually configured Plex URL as fallback: ${configUrl}`,
      )
      return [
        {
          url: configUrl,
          local:
            configUrl.includes('localhost') || configUrl.includes('127.0.0.1'),
          relay: false,
          isDefault: true,
        },
      ]
    }

    // Otherwise use localhost as the default fallback
    this.log.debug('Using localhost as default fallback Plex URL')
    return [
      {
        url: defaultUrl,
        local: true, // Localhost is always local
        relay: false,
        isDefault: true,
      },
    ]
  }

  /**
   * Selects the optimal Plex server URL for API calls based on priority
   *
   * @param preferLocal - Whether to prioritize local connections
   * @returns The best available Plex server URL
   */
  async getPlexServerUrl(preferLocal = true): Promise<string> {
    // If we've already selected a connection, reuse it without logging
    if (this.selectedConnectionUrl) {
      return this.selectedConnectionUrl
    }

    const connections = await this.getPlexServerConnectionInfo()

    if (connections.length === 0) {
      this.log.info(
        'No Plex connections found, using localhost fallback: http://localhost:32400',
      )
      this.selectedConnectionUrl = 'http://localhost:32400'
      return this.selectedConnectionUrl
    }

    // Prioritize default connection if available
    const defaultConn = connections.find((c) => c.isDefault)
    if (defaultConn) {
      this.log.info(`Using default Plex connection: ${defaultConn.url}`)
      this.selectedConnectionUrl = defaultConn.url
      return this.selectedConnectionUrl
    }

    // Otherwise if we prefer local and there's a local connection, use that
    if (preferLocal) {
      const localConn = connections.find((c) => c.local)
      if (localConn) {
        this.log.info(`Using local Plex connection: ${localConn.url}`)
        this.selectedConnectionUrl = localConn.url
        return this.selectedConnectionUrl
      }
    }

    // Then try non-relay connections
    const nonRelayConn = connections.find((c) => !c.relay)
    if (nonRelayConn) {
      this.log.info(`Using non-relay Plex connection: ${nonRelayConn.url}`)
      this.selectedConnectionUrl = nonRelayConn.url
      return this.selectedConnectionUrl
    }

    // Finally use the first available connection, even if it's a relay
    this.log.info(
      `Using fallback Plex connection (relay): ${connections[0].url}`,
    )
    this.selectedConnectionUrl = connections[0].url
    return this.selectedConnectionUrl
  }

  /**
   * Retrieves all Plex users with access to the server
   * Uses caching for performance optimization
   *
   * @returns Promise resolving to array of Plex users
   */
  async getPlexUsers(): Promise<PlexUser[]> {
    try {
      // Use cached user data if valid (less than 30 minutes old)
      if (this.users && Date.now() - this.usersTimestamp < 30 * 60 * 1000) {
        this.log.debug('Using cached Plex users')
        return this.users
      }

      const plexTvUrl = 'https://plex.tv'
      const adminToken = this.config.plexTokens?.[0] || ''

      if (!adminToken) {
        this.log.warn('No Plex admin token available for user operations')
        return []
      }

      // Get all users including friends and home users
      const usersUrl = new URL('/api/users', plexTvUrl)
      const usersResponse = await fetch(usersUrl.toString(), {
        headers: {
          // This endpoint returns XML format
          'X-Plex-Token': adminToken,
          'X-Plex-Client-Identifier': 'Pulsarr',
        },
        signal: AbortSignal.timeout(8000),
      })

      if (!usersResponse.ok) {
        throw new Error(
          `Failed to fetch users: ${usersResponse.status} ${usersResponse.statusText}`,
        )
      }

      // Get response as text in XML format
      const responseText = await usersResponse.text()

      // Use proper XML parser
      const xmlParser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '',
        isArray: (name) => name === 'User',
      })

      try {
        // Parse XML
        const parsed = xmlParser.parse(responseText)
        const users = parsed.MediaContainer?.User || []

        this.log.debug(`Parsed ${users.length} users from Plex API response`)

        // Format users into a consistent structure that matches the PlexUser interface
        const formattedUsers = users
          .map(
            (user: {
              id?: string
              username?: string
              title?: string
              email?: string
            }) => ({
              id: user.id || '',
              username: user.username || user.title || '', // username is required in PlexUser
              title: user.title || '',
              email: user.email || '', // Ensure email always has a value
            }),
          )
          .filter(
            (user: { id: string; title: string }) => user.id && user.title,
          ) as PlexUser[]

        // Cache the result and return
        this.users = formattedUsers
        this.usersTimestamp = Date.now()

        this.log.debug(`Found ${formattedUsers.length} Plex users`)
        return formattedUsers
      } catch (xmlError) {
        this.log.error('Error parsing Plex users XML:', xmlError)

        // Fallback to regex as a last resort
        this.log.warn('Falling back to regex parsing for Plex users')
        const userMatches = responseText.match(/<User [^>]*>/g) || []
        this.log.debug(
          `Found ${userMatches.length} User entries in XML response`,
        )

        const users: {
          id: string
          title: string
          username?: string
          email?: string
        }[] = []

        for (const userMatch of userMatches) {
          const id = userMatch.match(/id="([^"]+)"/)?.[1] || ''
          const title = userMatch.match(/title="([^"]+)"/)?.[1] || ''
          const username = userMatch.match(/username="([^"]+)"/)?.[1] || title
          const email = userMatch.match(/email="([^"]+)"/)?.[1] || ''

          if (id && title) {
            users.push({
              id,
              title,
              username,
              email,
            })
          }
        }

        // Ensure all users have required fields according to PlexUser interface
        const formattedUsers = users.map((user) => ({
          ...user,
          username: user.username || user.title || '', // username is required
        })) as PlexUser[]

        // Cache the result and return
        this.users = formattedUsers
        this.usersTimestamp = Date.now()

        this.log.debug(`Found ${formattedUsers.length} Plex users`)
        return formattedUsers
      }
    } catch (error) {
      this.log.error('Error fetching Plex users:', error)
      return []
    }
  }

  /**
   * Retrieves shared server information including user access tokens
   * Essential for multi-user authentication
   *
   * @returns Promise resolving to a map of username to shared server info
   */
  async getSharedServerInfo(): Promise<Map<string, PlexSharedServerInfo>> {
    try {
      // Use cached server info if valid (less than 6 hours old)
      if (
        this.sharedServerInfo &&
        Date.now() - this.sharedServerInfoTimestamp < 6 * 60 * 60 * 1000
      ) {
        this.log.debug('Using cached shared server info')
        return this.sharedServerInfo
      }

      const plexTvUrl = 'https://plex.tv'
      const adminToken = this.config.plexTokens?.[0] || ''

      if (!adminToken) {
        this.log.warn(
          'No Plex admin token available for shared server operations',
        )
        return new Map()
      }

      // Fetch server machine ID if not already cached
      if (!this.serverMachineId) {
        await this.getPlexServerConnectionInfo()
        if (!this.serverMachineId) {
          throw new Error('Could not determine server machine ID')
        }
      }

      // Fetch shared server info which contains user access tokens
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
          'X-Plex-Client-Identifier': 'Pulsarr',
          // This endpoint returns XML format
        },
        signal: AbortSignal.timeout(8000),
      })

      if (!response.ok) {
        throw new Error(
          `Failed to fetch shared server info: ${response.status} ${response.statusText}`,
        )
      }

      // Get response as text in XML format
      const responseText = await response.text()

      // Map to store username -> server info mapping
      const serverInfoMap = new Map<string, PlexSharedServerInfo>()

      // Use proper XML parser
      const xmlParser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '',
        isArray: (name) => name === 'SharedServer',
      })

      try {
        // Parse XML
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
        this.log.error('Error parsing shared servers XML:', xmlError)

        // Fallback to regex as a last resort
        this.log.warn('Falling back to regex parsing for shared servers')

        // Parse XML response with regex as fallback
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

      // Add admin/owner information with appropriate access token
      if (this.serverMachineId && adminToken) {
        // Add the server owner with admin token permissions
        const serverOwnerInfo = {
          id: 'owner',
          username: 'owner', // This can be updated with the actual owner username if needed
          email: '',
          userID: 'owner',
          accessToken: adminToken,
        }

        // Add the server owner entry
        serverInfoMap.set('owner', serverOwnerInfo)
        this.log.debug(
          'Added server owner to shared server info with admin token',
        )
      }

      // Cache the result
      this.sharedServerInfo = serverInfoMap
      this.sharedServerInfoTimestamp = Date.now()

      this.log.info(`Found access tokens for ${serverInfoMap.size} users`)
      return serverInfoMap
    } catch (error) {
      this.log.error('Error fetching shared server info:', error)
      return new Map()
    }
  }

  /**
   * Retrieves a Plex authentication token for the specified user
   * Uses cached data when available, otherwise fetches from shared server info
   *
   * @param username - The username to retrieve token for
   * @returns Promise resolving to the auth token or null if unavailable
   */
  async getUserToken(username: string): Promise<string | null> {
    try {
      // Check cache first
      const cachedInfo = this.userTokens.get(username.toLowerCase())
      if (
        cachedInfo &&
        Date.now() - cachedInfo.timestamp < 6 * 60 * 60 * 1000
      ) {
        this.log.debug(`Using cached token for user "${username}"`)
        return cachedInfo.token
      }

      // Get shared server info which contains user tokens
      const serverInfoMap = await this.getSharedServerInfo()

      // Try to find the user (case-insensitive search)
      let userInfo: PlexSharedServerInfo | undefined

      // First try exact match
      userInfo = serverInfoMap.get(username)

      // If not found, try case-insensitive match
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
        return null
      }

      // Cache the token
      this.userTokens.set(username.toLowerCase(), {
        token: userInfo.accessToken,
        timestamp: Date.now(),
      })

      this.log.debug(`Found access token for user "${username}"`)
      return userInfo.accessToken
    } catch (error) {
      this.log.error(`Error getting token for user "${username}":`, error)
      return null
    }
  }

  /**
   * Locates a user's playlist by its title
   *
   * @param username - The Plex username
   * @param title - The playlist title to search for
   * @returns Promise resolving to playlist ID or null if not found
   */
  async findUserPlaylistByTitle(
    username: string,
    title: string,
  ): Promise<string | null> {
    try {
      const baseUrl = await this.getPlexServerUrl()
      const token = await this.getUserToken(username)

      if (!token) {
        this.log.warn(`No token available for user "${username}"`)
        return null
      }

      const url = new URL('/playlists', baseUrl)
      const response = await fetch(url.toString(), {
        headers: {
          Accept: 'application/json',
          'X-Plex-Token': token,
          'X-Plex-Client-Identifier': 'Pulsarr',
        },
        signal: AbortSignal.timeout(8000),
      })

      if (!response.ok) {
        throw new Error(
          `Failed to fetch playlists for user "${username}": ${response.status} ${response.statusText}`,
        )
      }

      const data = (await response.json()) as PlexPlaylistResponse
      const playlists = data.MediaContainer.Metadata

      const matchingPlaylist = playlists.find(
        (playlist) => playlist.title === title,
      )

      return matchingPlaylist ? matchingPlaylist.ratingKey : null
    } catch (error) {
      // Only log as debug if the error is related to not finding the playlist
      // This is expected behavior when we're checking if a playlist exists before creating it
      this.log.debug(
        `Could not find playlist "${title}" for user "${username}":`,
        error,
      )
      return null
    }
  }

  /**
   * Creates a new playlist for the specified user
   *
   * @param username - The Plex username
   * @param options - Playlist configuration options
   * @returns Promise resolving to the new playlist ID or null if creation failed
   */
  async createUserPlaylist(
    username: string,
    options: {
      title: string
      type: 'video' | 'audio' | 'photo' | 'mixed'
      smart?: boolean
    },
  ): Promise<string | null> {
    try {
      const baseUrl = await this.getPlexServerUrl()
      const token = await this.getUserToken(username)

      if (!token) {
        this.log.warn(`No token available for user "${username}"`)
        return null
      }

      // For Plex, let's use video type which is more compatible
      const playlistType = options.type === 'mixed' ? 'video' : options.type

      // Build the URL with required parameters
      const url = new URL('/playlists', baseUrl)
      url.searchParams.append('title', options.title)
      url.searchParams.append('type', playlistType)
      url.searchParams.append('smart', options.smart ? '1' : '0')
      url.searchParams.append('uri', 'library://all')

      this.log.debug(
        `Creating playlist "${options.title}" for user "${username}"`,
      )

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'X-Plex-Token': token,
          'X-Plex-Client-Identifier': 'Pulsarr',
        },
        signal: AbortSignal.timeout(8000),
      })

      if (!response.ok) {
        throw new Error(
          `Failed to create playlist for user "${username}": ${response.status} ${response.statusText}`,
        )
      }

      const data = (await response.json()) as PlexPlaylistResponse
      const playlistId = data.MediaContainer?.Metadata?.[0]?.ratingKey

      // Don't log here - we'll log in the parent function to avoid duplicate logs
      return playlistId || null
    } catch (error) {
      this.log.error(
        `Error creating playlist "${options.title}" for user "${username}":`,
        error,
      )
      return null
    }
  }

  /**
   * Ensures protection playlists exist for all users
   * Maintains a map of username to playlist ID for tracking
   *
   * @param createIfMissing - Whether to create playlists that don't exist
   * @returns Promise resolving to a map of username to playlist ID
   */
  async getOrCreateProtectionPlaylists(
    createIfMissing = true,
  ): Promise<Map<string, string>> {
    // Use cached playlist map if available
    if (this.protectedPlaylistsMap) {
      return this.protectedPlaylistsMap
    }

    const playlistMap = new Map<string, string>()

    try {
      // Use the configured playlist name if available
      const playlistName = this.getProtectionPlaylistName()

      // Get all users
      const users = await this.getPlexUsers()

      // Ensure the admin/owner user is included
      const adminToken = this.config.plexTokens?.[0]
      if (adminToken) {
        // Check if owner is already in the list
        const hasOwner = users.some(
          (user) =>
            user.username.toLowerCase() === 'owner' ||
            user.username.toLowerCase() === 'admin',
        )

        if (!hasOwner) {
          // Add the owner user if not present
          this.log.info(
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

      this.log.info(`Checking protection playlists for ${users.length} users`)

      // Process each user
      for (const user of users) {
        try {
          // First try to find the existing playlist
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

          // Create the playlist if it doesn't exist and creation is enabled
          if (createIfMissing) {
            const newPlaylistId = await this.createUserPlaylist(user.username, {
              title: playlistName,
              type: 'mixed', // Allow both movies and shows
              smart: false, // Regular playlist, not smart
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
            `Error processing protection playlist for user "${user.username}":`,
            error,
          )
        }
      }

      this.log.info(
        `Successfully processed protection playlists for ${playlistMap.size} of ${users.length} users`,
      )

      // Cache the result
      this.protectedPlaylistsMap = playlistMap

      return playlistMap
    } catch (error) {
      this.log.error('Error in getOrCreateProtectionPlaylists:', error)
      return playlistMap
    }
  }

  /**
   * Retrieves all items in a user's playlist with pagination support
   *
   * @param username - The Plex username
   * @param playlistId - The playlist ID to retrieve items from
   * @returns Promise resolving to a set of playlist items
   */
  async getUserPlaylistItems(
    username: string,
    playlistId: string,
  ): Promise<Set<PlexPlaylistItem>> {
    try {
      const baseUrl = await this.getPlexServerUrl()
      const token = await this.getUserToken(username)

      if (!token) {
        this.log.warn(`No token available for user "${username}"`)
        return new Set()
      }

      const allItems = new Set<PlexPlaylistItem>()
      let offset = 0
      const limit = 100 // Standard pagination limit for Plex
      let hasMoreItems = true

      // Handle pagination by fetching items until we get them all
      while (hasMoreItems) {
        const url = new URL(`/playlists/${playlistId}/items`, baseUrl)
        url.searchParams.append('X-Plex-Container-Start', offset.toString())
        url.searchParams.append('X-Plex-Container-Size', limit.toString())

        const response = await fetch(url.toString(), {
          headers: {
            Accept: 'application/json',
            'X-Plex-Token': token,
            'X-Plex-Client-Identifier': 'Pulsarr',
          },
          signal: AbortSignal.timeout(8000),
        })

        if (!response.ok) {
          throw new Error(
            `Failed to fetch playlist items for user "${username}": ${response.status} ${response.statusText}`,
          )
        }

        const data = (await response.json()) as PlexPlaylistItemsResponse
        const items = data.MediaContainer.Metadata || []

        // Add current batch of items to our result set
        for (const item of items) {
          allItems.add({
            guid: item.guid,
            grandparentGuid: item.grandparentGuid,
            parentGuid: item.parentGuid,
            type: item.type,
            title: item.grandparentTitle || item.title,
          })
        }

        // Check if we need to fetch more items
        const currentSize = items.length
        const totalSize = data.MediaContainer.totalSize || items.length

        // Update offset and check if we have more items to fetch
        offset += currentSize
        hasMoreItems = offset < totalSize && currentSize > 0

        this.log.debug(
          `Fetched ${currentSize} playlist items for user "${username}", total so far: ${offset} of ${totalSize}`,
        )
      }

      this.log.debug(
        `Found ${allItems.size} items in playlist ${playlistId} for user "${username}"`,
      )
      return allItems
    } catch (error) {
      this.log.error(
        `Error getting playlist items for user "${username}":`,
        error,
      )
      return new Set()
    }
  }

  /**
   * Retrieves all protected item GUIDs from all user protection playlists
   * Fetches complete metadata for each item and extracts standardized GUIDs
   *
   * @returns Promise resolving to a set of protected GUIDs
   */
  async getProtectedItems(): Promise<Set<string>> {
    // This method should be called at the start of a delete sync workflow
    // The result is cached only for the duration of a single workflow execution

    // Use cached results if available during the current workflow
    if (this.protectedItemsCache) {
      this.log.debug('Using cached protected items from current workflow')
      return this.protectedItemsCache
    }

    const protectedGuids = new Set<string>()

    // Use the configured playlist name if available
    const playlistName = this.getProtectionPlaylistName()

    if (!this.config.enablePlexPlaylistProtection) {
      this.log.debug('Plex playlist protection is disabled')
      return protectedGuids
    }

    try {
      // Get or create playlists for all users
      const userPlaylists = await this.getOrCreateProtectionPlaylists(true)

      if (userPlaylists.size === 0) {
        this.log.warn(
          `No "${playlistName}" playlists found or created for any users`,
        )
        return protectedGuids
      }

      // Process each user's playlist
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

          this.log.info(
            `Processing ${playlistItems.size} protected items from playlist "${playlistName}" for user "${username}"`,
          )

          // Process each item to fetch full metadata and extract standardized GUIDs
          for (const item of playlistItems) {
            try {
              const itemMetadata = await this.getItemMetadata(
                username,
                item.guid,
                item.grandparentGuid,
                item.type,
              )

              if (itemMetadata?.guids && itemMetadata.guids.length > 0) {
                // Add each standardized GUID to the protected set
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
                  `Failed to retrieve standardized GUIDs for protected item "${item.title}" - item may not be properly protected`,
                )
              }
            } catch (itemError) {
              this.log.error(
                `Error processing protected item "${item.title}":`,
                itemError,
              )
            }
          }

          this.log.debug(
            `Processed ${playlistItems.size} protected items from user "${username}"`,
          )
        } catch (error) {
          this.log.error(
            `Error processing protected items for user "${username}":`,
            error,
          )
        }
      }

      this.log.info(
        `Found a total of ${protectedGuids.size} unique protected GUIDs across all users`,
      )

      // Log a sample of protected GUIDs at debug level only
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

      // Store in cache for the duration of the current workflow
      this.protectedItemsCache = protectedGuids
      this.log.info(
        `Cached ${protectedGuids.size} protected GUIDs for current workflow`,
      )

      return protectedGuids
    } catch (error) {
      this.log.error(
        'Error getting protected items from user playlists:',
        error,
      )
      return protectedGuids
    }
  }

  /**
   * Retrieves comprehensive metadata for a Plex item including standardized GUIDs
   *
   * @param username - The Plex username to authenticate as
   * @param plexGuid - The Plex GUID in format "plex://movie/5d776832a091de001f2e780f" or "plex://episode/5ea3e26f382f910042f103d0"
   * @param grandparentGuid - For TV episodes, the show's GUID in format "plex://show/5eb6b5ffac1f29003f4a737b"
   * @param itemType - The type of the item ("movie", "show", "episode")
   * @returns Promise resolving to an object with title and GUIDs, or null if not found
   */
  async getItemMetadata(
    username: string,
    plexGuid: string,
    grandparentGuid?: string,
    itemType?: string,
  ): Promise<{ title: string; guids: string[] } | null> {
    try {
      // For TV shows, use the grandparentGuid (show GUID) if available
      const guidToUse =
        itemType === 'episode' && grandparentGuid ? grandparentGuid : plexGuid

      // Extract the media ID from the Plex GUID to create a key
      const mediaId = guidToUse.split(/[\/:]/).pop()
      if (!mediaId) {
        this.log.warn(`Invalid Plex GUID format: "${guidToUse}"`)
        return null
      }

      // Determine the content type from the GUID
      const contentType = guidToUse.includes('/movie/')
        ? 'movie'
        : guidToUse.includes('/show/')
          ? 'show'
          : itemType || (plexGuid.includes('/episode/') ? 'show' : 'movie')

      // Create a temporary item structure for metadata retrieval
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

      // No pre-check needed, letting toItemsSingle handle the metadata retrieval and retries

      // Utilize toItemsSingle utility for standardized GUID extraction
      const itemSet = await toItemsSingle(
        this.config,
        this.log,
        tempItem,
        0, // start with retry count 0
        3, // Allow standard retry count for metadata retrieval
      )

      // Extract first result from the metadata set
      const items = Array.from(itemSet)
      if (items.length === 0) {
        this.log.warn('No metadata found for item')
        return null
      }

      const item = items[0] as Item

      // Extract standardized GUIDs and ensure we return a valid array
      const extractedGuids = Array.isArray(item.guids)
        ? item.guids
        : typeof item.guids === 'string'
          ? parseGuids(item.guids)
          : []

      // Log the found GUIDs at debug level
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
      this.log.error(`Error getting metadata for item: ${error}`)
      return null
    }
  }

  /**
   * Determines if an item is protected by any user's protection playlist
   *
   * @param itemGuids - The GUIDs of the item to check, can be a string, array, or undefined
   * @param itemTitle - Optional title for better logging
   * @returns True if item is protected, false otherwise
   */
  async isItemProtected(
    itemGuids: string[] | string | undefined,
    itemTitle?: string,
  ): Promise<boolean> {
    // Early return if protection is disabled
    if (!this.config.enablePlexPlaylistProtection) {
      this.log.debug(
        'Plex playlist protection is disabled - skipping protection check',
      )
      return false
    }

    // Validate input GUIDs
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

    // Get all protected GUIDs
    const protectedGuids = await this.getProtectedItems()
    if (protectedGuids.size === 0) {
      this.log.debug('No protected items found in any user playlist')
      return false
    }

    // Parse the input GUIDs to standardized format
    const parsedGuids = parseGuids(itemGuids)
    if (parsedGuids.length === 0) {
      this.log.warn(
        `No valid GUIDs found in input for item${itemTitle ? ` "${itemTitle}"` : ''}`,
      )
      return false
    }

    // Check for any matching GUIDs against the protected set
    for (const guid of parsedGuids) {
      if (protectedGuids.has(guid)) {
        this.log.info(
          `Item${itemTitle ? ` "${itemTitle}"` : ''} is protected with matching GUID: "${guid}"`,
        )
        return true
      }
    }

    // For debugging, log the GUIDs we checked
    if (this.log.level === 'debug' || this.log.level === 'trace') {
      this.log.debug(
        `Item${itemTitle ? ` "${itemTitle}"` : ''} with GUIDs [${parsedGuids.join(', ')}] is not protected`,
      )
    }
    return false
  }

  /**
   * Resets all cached data to force fresh retrieval
   * Useful for testing or when manual refresh is required
   *
   * @param resetInitialized - If true, will also reset the initialized state (default: false)
   */
  clearCaches(resetInitialized = false): void {
    this.log.info('Clearing all PlexServerService caches')
    this.serverConnections = null
    this.serverMachineId = null
    this.connectionTimestamp = 0
    this.selectedConnectionUrl = null
    this.users = null
    this.usersTimestamp = 0
    this.userTokens = new Map()
    this.protectedPlaylistsMap = null
    this.protectedItemsCache = null
    this.sharedServerInfo = null
    this.sharedServerInfoTimestamp = 0

    // Only reset the initialized state if explicitly requested
    if (resetInitialized) {
      this.log.warn('Resetting Plex server initialization state')
      this.initialized = false
    }
  }

  /**
   * Clears only the workflow-specific caches
   * Should be called at the end of a delete sync workflow
   */
  clearWorkflowCaches(): void {
    this.log.info('Clearing workflow-specific caches')
    this.protectedPlaylistsMap = null
    this.protectedItemsCache = null

    // Ensure we don't reset the initialized state, as that's managed separately
    // through the initialize() method
  }

  /**
   * Retrieves active Plex sessions from the server
   *
   * @returns Promise resolving to array of active sessions
   */
  async getActiveSessions(): Promise<PlexSession[]> {
    try {
      const serverUrl = await this.getPlexServerUrl()
      const adminToken = this.config.plexTokens?.[0] || ''

      if (!adminToken) {
        this.log.warn('No Plex admin token available for session monitoring')
        return []
      }

      const url = new URL('/status/sessions', serverUrl)
      const response = await fetch(url.toString(), {
        headers: {
          Accept: 'application/json',
          'X-Plex-Token': adminToken,
          'X-Plex-Client-Identifier': 'Pulsarr',
        },
        signal: AbortSignal.timeout(8000),
      })

      if (!response.ok) {
        throw new Error(
          `Failed to fetch sessions: ${response.status} ${response.statusText}`,
        )
      }

      const data = (await response.json()) as PlexSessionResponse
      const sessions = data.MediaContainer.Metadata || []

      this.log.debug(`Found ${sessions.length} active Plex sessions`)
      return sessions
    } catch (error) {
      this.log.error('Error fetching Plex sessions:', error)
      return []
    }
  }

  /**
   * Retrieves detailed show metadata including season and episode information
   *
   * @param ratingKey - The show's rating key
   * @param includeChildren - Whether to include season/episode details
   * @returns Promise resolving to show metadata or null
   */
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
    try {
      const serverUrl = await this.getPlexServerUrl()
      const adminToken = this.config.plexTokens?.[0] || ''

      if (!adminToken) {
        this.log.warn('No Plex admin token available for metadata retrieval')
        return null
      }

      const url = new URL(`/library/metadata/${ratingKey}`, serverUrl)
      if (includeChildren) {
        url.searchParams.append('includeChildren', '1')
      }

      const response = await fetch(url.toString(), {
        headers: {
          Accept: 'application/json',
          'X-Plex-Token': adminToken,
          'X-Plex-Client-Identifier': 'Pulsarr',
        },
        signal: AbortSignal.timeout(8000),
      })

      if (!response.ok) {
        throw new Error(
          `Failed to fetch show metadata: ${response.status} ${response.statusText}`,
        )
      }

      const data = (await response.json()) as PlexShowMetadata
      return data
    } catch (error) {
      this.log.error(
        `Error fetching show metadata for key ${ratingKey}:`,
        error,
      )
      return null
    }
  }

  /**
   * Searches for content in the Plex library by GUID
   *
   * @param guid - The GUID to search for (will be normalized)
   * @returns Promise resolving to array of matching PlexMetadata items
   */
  async searchByGuid(guid: string): Promise<PlexMetadata[]> {
    try {
      const serverUrl = await this.getPlexServerUrl()
      const adminToken = this.config.plexTokens?.[0] || ''

      if (!adminToken) {
        this.log.warn('No Plex admin token available for library search')
        return []
      }

      // Don't normalize plex:// GUIDs as they're internal Plex identifiers
      // Only normalize external provider GUIDs (tmdb://, tvdb://, etc.)
      const normalizedGuid = guid.startsWith('plex://')
        ? guid
        : normalizeGuid(guid)

      const url = new URL('/library/all', serverUrl)
      url.searchParams.append('guid', normalizedGuid)

      this.log.debug(`Searching Plex library for GUID: ${normalizedGuid}`)

      const response = await fetch(url.toString(), {
        headers: {
          Accept: 'application/json',
          'X-Plex-Token': adminToken,
          'X-Plex-Client-Identifier': 'Pulsarr',
        },
        signal: AbortSignal.timeout(8000),
      })

      if (!response.ok) {
        throw new Error(
          `Failed to search library by GUID: ${response.status} ${response.statusText}`,
        )
      }

      const data = (await response.json()) as PlexSearchResponse
      const results = data.MediaContainer.Metadata || []

      this.log.debug(
        `Found ${results.length} results for GUID: ${normalizedGuid}`,
        {
          normalizedGuid,
          originalGuid: guid,
          hasMetadata: !!data.MediaContainer.Metadata,
          containerSize: data.MediaContainer.size,
          fullUrl: url.toString(),
        },
      )
      return results
    } catch (error) {
      this.log.error(`Error searching library by GUID "${guid}":`, error)
      return []
    }
  }

  /**
   * Retrieves detailed metadata for a specific item by rating key
   *
   * @param ratingKey - The Plex rating key of the item
   * @returns Promise resolving to metadata or null if not found
   */
  async getMetadata(ratingKey: string): Promise<PlexMetadata | null> {
    try {
      const serverUrl = await this.getPlexServerUrl()
      const adminToken = this.config.plexTokens?.[0] || ''

      if (!adminToken) {
        this.log.warn('No Plex admin token available for metadata retrieval')
        return null
      }

      const url = new URL(`/library/metadata/${ratingKey}`, serverUrl)

      this.log.debug(`Fetching metadata for rating key: ${ratingKey}`)

      const response = await fetch(url.toString(), {
        headers: {
          Accept: 'application/json',
          'X-Plex-Token': adminToken,
          'X-Plex-Client-Identifier': 'Pulsarr',
        },
        signal: AbortSignal.timeout(8000),
      })

      if (!response.ok) {
        throw new Error(
          `Failed to fetch metadata: ${response.status} ${response.statusText}`,
        )
      }

      const data = (await response.json()) as PlexMetadataResponse
      const metadata = data.MediaContainer.Metadata?.[0] || null

      if (!metadata) {
        this.log.warn(`No metadata found for rating key: ${ratingKey}`)
        return null
      }

      this.log.debug(`Retrieved metadata for: ${metadata.title}`)
      return metadata
    } catch (error) {
      this.log.error(
        `Error fetching metadata for rating key "${ratingKey}":`,
        error,
      )
      return null
    }
  }

  /**
   * Updates the labels for a specific Plex item
   *
   * @param ratingKey - The Plex rating key of the item to update
   * @param labels - Array of label strings to set on the item
   * @returns Promise resolving to true if successful, false otherwise
   */
  async updateLabels(ratingKey: string, labels: string[]): Promise<boolean> {
    try {
      const serverUrl = await this.getPlexServerUrl()
      const adminToken = this.config.plexTokens?.[0] || ''

      if (!adminToken) {
        this.log.warn('No Plex admin token available for label update')
        return false
      }

      const url = new URL(`/library/metadata/${ratingKey}`, serverUrl)

      // Handle empty labels array - this means we want to set the exact labels specified
      // For Plex API: specifying exact labels will replace all existing labels
      if (labels.length === 0) {
        // Don't add any label parameters - this means "no labels"
        // But this would remove ALL labels including user-created ones
        // This method should only be used when we want to completely clear labels
        this.log.debug(
          `No labels specified for rating key ${ratingKey} - this will remove ALL labels`,
        )
      } else {
        // Add each label as a separate parameter - this is the format Plex expects
        for (const [index, label] of labels.entries()) {
          url.searchParams.append(`label[${index}].tag.tag`, label)
        }

        this.log.debug(
          `Updating labels for rating key ${ratingKey}: [${labels.join(', ')}]`,
        )
      }

      const response = await fetch(url.toString(), {
        method: 'PUT',
        headers: {
          Accept: 'application/json',
          'X-Plex-Token': adminToken,
          'X-Plex-Client-Identifier': 'Pulsarr',
        },
        signal: AbortSignal.timeout(8000),
      })

      if (!response.ok) {
        throw new Error(
          `Failed to update labels: ${response.status} ${response.statusText}`,
        )
      }

      if (labels.length === 0) {
        this.log.debug(
          `Successfully removed all labels from rating key ${ratingKey}`,
        )
      } else {
        this.log.debug(
          `Successfully updated labels for rating key ${ratingKey}`,
        )
      }
      return true
    } catch (error) {
      this.log.error(
        `Error updating labels for rating key "${ratingKey}":`,
        error,
      )
      return false
    }
  }

  /**
   * Removes specific labels from a Plex content item using native API removal syntax
   *
   * @param ratingKey - The Plex rating key of the item
   * @param labelsToRemove - Array of label strings to remove from the item
   * @returns Promise resolving to true if successful, false otherwise
   */
  async removeLabels(
    ratingKey: string,
    labelsToRemove: string[],
  ): Promise<boolean> {
    try {
      if (labelsToRemove.length === 0) {
        return true // Nothing to remove
      }

      const serverUrl = await this.getPlexServerUrl()
      const adminToken = this.config.plexTokens?.[0] || ''

      if (!adminToken) {
        this.log.warn('No Plex admin token available for label removal')
        return false
      }

      const url = new URL(`/library/metadata/${ratingKey}`, serverUrl)

      // Use Plex API specific removal syntax: label[].tag.tag-=LabelName
      // Multiple labels can be removed by comma-separating them
      const labelsToRemoveEncoded = labelsToRemove.join(',')
      url.searchParams.append('label[].tag.tag-', labelsToRemoveEncoded)

      this.log.debug(
        `Removing specific labels from rating key ${ratingKey}: [${labelsToRemove.join(', ')}]`,
      )

      const response = await fetch(url.toString(), {
        method: 'PUT',
        headers: {
          Accept: 'application/json',
          'X-Plex-Token': adminToken,
          'X-Plex-Client-Identifier': 'Pulsarr',
        },
        signal: AbortSignal.timeout(8000),
      })

      if (!response.ok) {
        throw new Error(
          `Failed to remove labels: ${response.status} ${response.statusText}`,
        )
      }

      this.log.debug(`Successfully removed labels from rating key ${ratingKey}`)
      return true
    } catch (error) {
      this.log.error(
        `Error removing specific labels from rating key "${ratingKey}":`,
        error,
      )
      return false
    }
  }
}
