export interface PlexPlaylistResponse {
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
export interface PlexPlaylistItemsResponse {
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
export interface PlexUser {
  id: string
  username: string
  title: string
  email?: string
}

/**
 * Plex shared server information with user access tokens
 */
export interface PlexSharedServerInfo {
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
export interface PlexResource {
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
export interface PlexMetadata {
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
export interface PlexSearchResponse {
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
export interface PlexMetadataResponse {
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
