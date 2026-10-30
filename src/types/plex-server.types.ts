export interface PlexPlaylistResponse {
  MediaContainer: {
    size?: number
    Metadata?: Array<{
      ratingKey: string
      key: string
      guid: string
      type: 'playlist'
      title: string
      summary?: string
      smart?: boolean
      playlistType?: string
    }>
  }
}

export interface PlexPlaylistItemsResponse {
  MediaContainer: {
    size: number
    offset?: number
    totalSize?: number
    Metadata: Array<{
      ratingKey: string
      key: string
      guid: string
      type: 'movie' | 'show' | 'episode' | 'season'
      title: string
      grandparentTitle?: string
      grandparentGuid?: string
      parentGuid?: string
      parentRatingKey?: string
      grandparentRatingKey?: string
    }>
  }
}

export interface PlexPlaylistItem {
  guid: string // plex://movie/<id> or plex://episode/<id>
  grandparentGuid?: string // The show guid when the item is an episode
  parentGuid?: string // The season guid when the item is an episode
  type: 'movie' | 'show' | 'episode'
  title: string // For logging only
}

export interface PlexServerConnectionInfo {
  url: string
  local: boolean
  relay: boolean
}

/** A user from the plex.tv /api/users XML endpoint. */
export interface PlexUser {
  id: string
  username: string
  title: string
  email?: string
  thumb?: string
  home?: boolean
  restricted?: boolean
  protected?: boolean
  allowTuners?: number
  allowSync?: boolean
  allowCameraUpload?: boolean
  allowChannels?: boolean
  allowSubtitleAdmin?: boolean
  filterAll?: string
  filterMovies?: string
  filterMusic?: string
  filterPhotos?: string
  filterTelevision?: string
  Server?: PlexUserServer[]
}

/** A server access entry nested in a PlexUser XML response. */
export interface PlexUserServer {
  id: string
  serverId: string
  machineIdentifier: string
  name: string
  lastSeenAt: string
  numLibraries: number
  allLibraries: boolean
  owned: boolean
  pending: boolean
}

export interface PlexSharedServerInfo {
  id: string
  username: string
  email: string
  userID: string
  accessToken: string
}

/** A server or client entry from plex.tv /api/v2/resources. */
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

export interface PlexMetadata {
  ratingKey: string
  key: string
  guid: string
  type: 'movie' | 'show' | 'episode' | 'season' | 'artist' | 'album' | 'track'
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
  Media?: Array<{
    Part?: Array<{
      file?: string
    }>
  }>
  Location?: Array<{
    path: string
  }>
}

/** Response from the /library/all endpoint. */
export interface PlexSearchResponse {
  MediaContainer: {
    size?: number
    totalSize?: number
    offset?: number
    Metadata?: PlexMetadata[]
  }
}

/** Response from the /library/metadata/{ratingKey} endpoint. */
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

/** A non-ok plex.tv response, carrying its HTTP status. */
export class PlexTvError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'PlexTvError'
  }
}
