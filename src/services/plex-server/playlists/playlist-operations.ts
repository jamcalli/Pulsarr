/**
 * Playlist Operations Module
 *
 * Provides functions for managing Plex playlists and playlist items.
 * All operations require a valid server URL and authentication token.
 */

import type {
  PlexPlaylistItem,
  PlexPlaylistItemsResponse,
  PlexPlaylistResponse,
} from '@root/types/plex-server.types.js'
import type { FastifyBaseLogger } from 'fastify'

const PLEX_API_TIMEOUT = 30000 // 30 seconds

/**
 * Locates a user's playlist by its title
 *
 * @param title - The playlist title to search for
 * @param serverUrl - The Plex server base URL
 * @param token - Authentication token for API access
 * @param log - Logger instance for operation tracking
 * @returns Promise resolving to playlist ID or null if not found
 */
export async function findUserPlaylistByTitle(
  title: string,
  serverUrl: string,
  token: string,
  log: FastifyBaseLogger,
): Promise<string | null> {
  try {
    if (!token) {
      log.warn('No token provided for playlist search')
      return null
    }

    const url = new URL('/playlists', serverUrl)
    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'X-Plex-Token': token,
        'X-Plex-Client-Identifier': 'Pulsarr',
      },
      signal: AbortSignal.timeout(PLEX_API_TIMEOUT),
    })

    if (!response.ok) {
      throw new Error(
        `Failed to fetch playlists: ${response.status} ${response.statusText}`,
      )
    }

    const data = (await response.json()) as PlexPlaylistResponse
    const playlists = data.MediaContainer.Metadata

    const matchingPlaylist = playlists.find(
      (playlist) => playlist.title === title,
    )

    return matchingPlaylist ? matchingPlaylist.ratingKey : null
  } catch (error) {
    log.debug({ error }, `Could not find playlist "${title}":`)
    return null
  }
}

/**
 * Creates a new playlist for a user
 *
 * @param options - Playlist configuration options
 * @param serverUrl - The Plex server base URL
 * @param token - Authentication token for API access
 * @param log - Logger instance for operation tracking
 * @returns Promise resolving to the new playlist ID or null if creation failed
 */
export async function createUserPlaylist(
  options: {
    title: string
    type: 'video' | 'audio' | 'photo' | 'mixed'
    smart?: boolean
  },
  serverUrl: string,
  token: string,
  log: FastifyBaseLogger,
): Promise<string | null> {
  try {
    if (!token) {
      log.warn('No token provided for playlist creation')
      return null
    }

    // For Plex, let's use video type which is more compatible
    const playlistType = options.type === 'mixed' ? 'video' : options.type

    // Build the URL with required parameters
    const url = new URL('/playlists', serverUrl)
    url.searchParams.append('title', options.title)
    url.searchParams.append('type', playlistType)
    url.searchParams.append('smart', options.smart ? '1' : '0')
    url.searchParams.append('uri', 'library://all')

    log.debug(`Creating playlist "${options.title}"`)

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'X-Plex-Token': token,
        'X-Plex-Client-Identifier': 'Pulsarr',
      },
      signal: AbortSignal.timeout(PLEX_API_TIMEOUT),
    })

    if (!response.ok) {
      throw new Error(
        `Failed to create playlist: ${response.status} ${response.statusText}`,
      )
    }

    const data = (await response.json()) as PlexPlaylistResponse
    const playlistId = data.MediaContainer?.Metadata?.[0]?.ratingKey

    return playlistId || null
  } catch (error) {
    log.error({ error }, `Error creating playlist "${options.title}":`)
    return null
  }
}

/**
 * Retrieves all items in a playlist with pagination support
 *
 * Automatically handles pagination by fetching items in batches until
 * all items have been retrieved. Only includes movies, shows, and episodes.
 *
 * @param playlistId - The playlist ID to retrieve items from
 * @param serverUrl - The Plex server base URL
 * @param token - Authentication token for API access
 * @param log - Logger instance for operation tracking
 * @returns Promise resolving to a set of playlist items
 */
export async function getUserPlaylistItems(
  playlistId: string,
  serverUrl: string,
  token: string,
  log: FastifyBaseLogger,
): Promise<Set<PlexPlaylistItem>> {
  try {
    if (!token) {
      log.warn('No token provided for playlist item retrieval')
      return new Set()
    }

    const allItems = new Set<PlexPlaylistItem>()
    let offset = 0
    const limit = 100 // Standard pagination limit for Plex
    let hasMoreItems = true

    // Handle pagination by fetching items until we get them all
    while (hasMoreItems) {
      const url = new URL(`/playlists/${playlistId}/items`, serverUrl)
      url.searchParams.append('X-Plex-Container-Start', offset.toString())
      url.searchParams.append('X-Plex-Container-Size', limit.toString())

      const response = await fetch(url.toString(), {
        headers: {
          Accept: 'application/json',
          'X-Plex-Token': token,
          'X-Plex-Client-Identifier': 'Pulsarr',
        },
        signal: AbortSignal.timeout(PLEX_API_TIMEOUT),
      })

      if (!response.ok) {
        throw new Error(
          `Failed to fetch playlist items: ${response.status} ${response.statusText}`,
        )
      }

      const data = (await response.json()) as PlexPlaylistItemsResponse
      const items = data.MediaContainer.Metadata || []

      // Add current batch of items to our result set
      for (const item of items) {
        // Only include movies, shows, and episodes in playlist protection checks
        if (
          item.type === 'movie' ||
          item.type === 'show' ||
          item.type === 'episode'
        ) {
          allItems.add({
            guid: item.guid,
            grandparentGuid: item.grandparentGuid,
            parentGuid: item.parentGuid,
            type: item.type,
            title: item.grandparentTitle || item.title,
          })
        }
      }

      // Check if we need to fetch more items
      const currentSize = items.length
      const totalSize = data.MediaContainer.totalSize || items.length

      // Update offset and check if we have more items to fetch
      offset += currentSize
      hasMoreItems = offset < totalSize && currentSize > 0

      log.debug(
        `Fetched ${currentSize} playlist items, total so far: ${offset} of ${totalSize}`,
      )
    }

    log.debug(`Found ${allItems.size} items in playlist ${playlistId}`)
    return allItems
  } catch (error) {
    log.error({ error }, 'Error getting playlist items:')
    return new Set()
  }
}
