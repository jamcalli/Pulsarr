import type { RadarrMovie } from '@root/types/radarr.types.js'
import type { SonarrSeries } from '@root/types/sonarr.types.js'

export interface PendingLabelSync {
  id?: number
  guid: string
  content_title: string
  retry_count: number
  last_retry_at?: Date | null
  created_at: Date
  expires_at: Date
}

/**
 * Result object for sync operations
 */
export interface SyncResult {
  processed: number
  updated: number
  failed: number
  pending: number
}

/**
 * Watchlist content grouped by GUID
 */
export interface GroupedWatchlistContent {
  guid: string
  title: string
  users: Array<{
    user_id: number
    username: string
    watchlist_id: number
  }>
}

/**
 * Content item with all associated users for content-centric processing
 */
export interface ContentWithUsers {
  /** Primary GUID identifying this content */
  primaryGuid: string
  /** All GUIDs associated with this content */
  allGuids: string[]
  /** Content title for logging */
  title: string
  /** Content type */
  type: 'movie' | 'show'
  /** Plex key if available */
  plexKey: string | null
  /** All users who have this content in their watchlist */
  users: Array<{
    user_id: number
    username: string
    watchlist_id: number
  }>
}

/**
 * Plex items found for content with their metadata
 */
export interface PlexContentItems {
  /** The content being processed */
  content: ContentWithUsers
  /** Plex items found for this content */
  plexItems: Array<{ ratingKey: string; title: string }>
}

/**
 * Label reconciliation result for a single content item
 */
export interface LabelReconciliationResult {
  /** Whether the operation was successful */
  success: boolean
  /** Number of labels added */
  labelsAdded: number
  /** Number of labels removed */
  labelsRemoved: number
  /** Error message if failed */
  error?: string
  /** Special removed label that was applied (for tracking purposes) */
  specialRemovedLabel?: string
}

/**
 * Radarr movie data with tags for tag sync
 */
export interface RadarrMovieWithTags {
  instanceId: number
  instanceName: string
  movie: RadarrMovie
  tags: string[]
}

/**
 * Sonarr series data with tags for tag sync
 */
export interface SonarrSeriesWithTags {
  instanceId: number
  instanceName: string
  series: SonarrSeries
  tags: string[]
  rootFolder?: string
}

/**
 * Plex API response interfaces for type safety
 */
export interface PlexSection {
  key: string
  type: string
  title: string
}

export interface PlexSectionsResponse {
  MediaContainer: {
    Directory?: PlexSection[]
  }
}

export interface PlexMetadataItem {
  ratingKey: string
  type: string
  title: string
}

export interface PlexItemsResponse {
  MediaContainer: {
    Metadata?: PlexMetadataItem[]
  }
}
