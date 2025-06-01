/**
 * Plex Session Types
 *
 * Type definitions for Plex session monitoring functionality
 */

/**
 * Minimal Plex session as returned by /status/sessions
 */
export interface PlexSession {
  type: string // Must be "episode" to be processed
  grandparentTitle: string // Series name
  grandparentKey: string // Series metadata key (e.g., "/library/metadata/1234")
  index: number // Episode number
  parentIndex: number // Season number
  User: {
    id: string
    title: string // Username
  }
  librarySectionTitle: string // Library name
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
        id: string // Format: "tvdb://12345", "imdb://tt1234567", etc.
      }>
    }>
  }
}

/**
 * Show metadata for determining episode counts
 * This is the simpler response when includeChildren=true
 */
export interface PlexShowMetadata {
  MediaContainer: {
    title1: string // Library name
    title2: string // Show name
    key: string
    ratingKey: string
    guid?: string // Main GUID (lowercase)
    Guid?: string | Array<{ id: string }> // Can be string or array (uppercase)
    type: string
    title: string
    summary?: string
    childCount: number // Number of seasons
    leafCount: number // Total episode count
    viewedLeafCount?: number
    Children?: {
      size: number
      Metadata?: PlexSeasonMetadata[]
    }
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
  monitoring_type: 'pilot_rolling' | 'first_season_rolling'
  current_monitored_season: number
  last_watched_season: number
  last_watched_episode: number
  last_session_date: Date
  sonarr_instance_id: number
  plex_user_id?: string
  plex_username?: string
  created_at: Date
  updated_at: Date
  last_updated_at: Date // For tracking inactivity and cleanup
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
