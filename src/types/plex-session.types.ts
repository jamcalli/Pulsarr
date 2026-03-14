/**
 * Plex Session Types
 *
 * Type definitions for Plex session monitoring functionality
 */

/**
 * Minimal Plex session as returned by /status/sessions
 */
export interface PlexSession {
  type: string // "episode", "movie", "track", etc.
  sessionKey: string // Unique per playback session (e.g., "92")
  ratingKey: string // Episode rating key (e.g., "106942")
  key: string // Episode metadata path (e.g., "/library/metadata/106942")
  guid: string // Plex GUID (e.g., "plex://episode/...")
  title: string // Episode title
  parentRatingKey: string // Season rating key
  parentKey: string // Season metadata path
  parentIndex: number // Season number
  parentTitle: string // Season title (e.g., "Season 1")
  parentGuid: string // Season Plex GUID
  grandparentRatingKey: string // Series rating key
  grandparentKey: string // Series metadata path (e.g., "/library/metadata/106940")
  grandparentTitle: string // Series name
  grandparentGuid: string // Series Plex GUID
  index: number // Episode number
  viewOffset: number // Current playback position in ms
  duration: number // Total duration in ms
  User: {
    id: string
    title: string // Username
  }
  Session: {
    id: string
    bandwidth: number
    location: string
  }
  librarySectionTitle: string // Library name
  librarySectionID: string // Library section ID
}

/**
 * Plex session response structure
 */
export interface PlexSessionResponse {
  MediaContainer: {
    size?: number
    Metadata?: PlexSession[]
  }
}

/**
 * For TVDB ID extraction from series metadata
 */
export interface PlexSeriesMetadata {
  MediaContainer: {
    Metadata: Array<{
      Guid?: Array<{
        id: string
      }>
    }>
  }
}

/**
 * Show metadata response from /library/metadata/{id}?includeChildren=1
 *
 * The Plex API nests show fields inside MediaContainer.Metadata[0],
 * with Children (seasons) nested inside each Metadata item.
 */
export interface PlexShowMetadata {
  MediaContainer: {
    size: number
    Metadata: Array<{
      ratingKey: string
      key: string
      guid?: string
      Guid?: Array<{ id: string }>
      type: string
      title: string
      summary?: string
      childCount: number
      leafCount: number
      viewedLeafCount?: number
      Children?: {
        size: number
        Metadata?: PlexSeasonMetadata[]
      }
    }>
  }
}

/**
 * Full show metadata response from /library/metadata/{id}
 * This is the detailed response that includes all metadata fields
 */
export interface PlexShowMetadataResponse {
  MediaContainer: {
    size: number
    allowSync: boolean
    identifier: string
    librarySectionID: number
    librarySectionTitle: string
    librarySectionUUID: string
    mediaTagPrefix: string
    mediaTagVersion: number
    Metadata: Array<{
      ratingKey: string
      key: string
      guid: string
      slug?: string
      studio?: string
      type: string
      title: string
      librarySectionTitle?: string
      librarySectionID?: number
      librarySectionKey?: string
      contentRating?: string
      summary?: string
      index?: number
      audienceRating?: number
      viewCount?: number
      lastViewedAt?: number
      year?: number
      thumb?: string
      art?: string
      theme?: string
      duration?: number
      originallyAvailableAt?: string
      leafCount?: number
      viewedLeafCount?: number
      childCount?: number
      addedAt?: number
      updatedAt?: number
      audienceRatingImage?: string
      Guid?: Array<{
        id: string
      }>
      Genre?: Array<{
        id: number
        filter: string
        tag: string
      }>
      Role?: Array<{
        id: number
        filter: string
        tag: string
        tagKey: string
        role: string
        thumb?: string
      }>
      Location?: Array<{
        path: string
      }>
      Image?: Array<{
        alt: string
        type: string
        url: string
      }>
      UltraBlurColors?: {
        topLeft: string
        topRight: string
        bottomRight: string
        bottomLeft: string
      }
      Country?: Array<{
        id: number
        filter: string
        tag: string
      }>
      Rating?: Array<{
        image: string
        value: number
        type: string
      }>
    }>
  }
}

/**
 * Season metadata
 */
export interface PlexSeasonMetadata {
  ratingKey: string
  key: string
  parentRatingKey: string
  guid: string
  type: string
  title: string
  parentTitle: string
  summary?: string
  index: number // Season number
  leafCount: number // Episode count in season
  viewedLeafCount?: number
  Children?: {
    size: number
    Metadata?: PlexEpisodeMetadata[]
  }
}

/**
 * Response from /library/metadata/{id}/children
 * Returns direct children (seasons for a show, episodes for a season)
 */
export interface PlexChildrenResponse {
  MediaContainer: {
    size: number
    Metadata?: Array<{
      ratingKey: string
      index: number
      title: string
      leafCount?: number
      [key: string]: unknown
    }>
  }
}

/**
 * Episode metadata
 */
export interface PlexEpisodeMetadata {
  ratingKey: string
  key: string
  parentRatingKey: string
  grandparentRatingKey: string
  guid: string
  type: string
  title: string
  grandparentTitle: string
  parentTitle: string
  contentRating?: string
  summary?: string
  index: number // Episode number
  parentIndex: number // Season number
  year?: number
  thumb?: string
  duration: number
  originallyAvailableAt?: string
  addedAt?: number
  updatedAt?: number
}

/**
 * Rolling monitoring tracking data
 */
export interface RollingMonitoredShow {
  id: number
  sonarr_series_id: number
  tvdb_id?: string
  imdb_id?: string
  show_title: string
  monitoring_type:
    | 'pilotRolling'
    | 'firstSeasonRolling'
    | 'allSeasonPilotRolling'
  current_monitored_season: number
  last_watched_season: number
  last_watched_episode: number
  last_session_date: string | null
  sonarr_instance_id: number
  plex_user_id?: string
  plex_username?: string
  created_at: string
  updated_at: string
  last_updated_at: string
}

// Plex SSE playing event payload from /:/eventsource/notifications
export interface PlexPlaySessionNotification {
  sessionKey: string
  clientIdentifier: string
  guid: string
  ratingKey: string
  url: string
  key: string
  viewOffset: number
  playQueueItemID: number
  state: 'playing' | 'paused' | 'stopped' | 'buffering' | 'error'
}

// Plex SSE timeline event payload from /:/eventsource/notifications
// Note: Plex sends sectionID and itemID as strings in named SSE events
export interface PlexTimelineEntry {
  itemID: number | string
  parentItemID?: number | string
  rootItemID?: number | string
  identifier: string
  sectionID: number | string
  type: number
  state: number
  title: string
  metadataState?: string
  mediaState?: string
  queueSize?: number
  updatedAt?: number
}

// Plex SSE reachability event payload from /:/eventsource/notifications
export interface PlexReachabilityNotification {
  reachability: boolean
}

/**
 * Session monitoring configuration
 */
export interface SessionMonitoringConfig {
  enabled: boolean
  pollingIntervalMinutes: number
  remainingEpisodes: number // Trigger when this many episodes remain
  filterUsers?: string[] // Optional user filter
  pilotOnlyThreshold: number // Consider pilot-only if season has <= this many episodes
}

/**
 * Session monitoring result
 */
export interface SessionMonitoringResult {
  processedSessions: number
  triggeredSearches: number
  errors: string[]
  rollingUpdates: Array<{
    showTitle: string
    action: 'expanded_to_season' | 'expanded_to_next_season' | 'switched_to_all'
    details: string
  }>
}
