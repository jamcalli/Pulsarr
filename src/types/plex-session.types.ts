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
