import type {
  PlexPlaylistItem,
  PlexPlaylistItemsResponse,
  PlexPlaylistResponse,
} from '@root/types/plex-server.types.js'
import { PLEX_CLIENT_IDENTIFIER } from '@utils/version.js'
import type { FastifyBaseLogger } from 'fastify'

const PLEX_API_TIMEOUT = 30000

/** Null when there is no token or no playlist has the title, and throws when Plex fails. */
export async function findUserPlaylistByTitle(
  title: string,
  serverUrl: string,
  token: string,
  log: FastifyBaseLogger,
): Promise<string | null> {
  if (!token) {
    log.warn('No token provided for playlist search')
    return null
  }

  const url = new URL('/playlists', serverUrl)
  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      'X-Plex-Token': token,
      'X-Plex-Client-Identifier': PLEX_CLIENT_IDENTIFIER,
    },
    signal: AbortSignal.timeout(PLEX_API_TIMEOUT),
  })

  if (!response.ok) {
    throw new Error(
      `Failed to fetch playlists: ${response.status} ${response.statusText}`,
    )
  }

  const data = (await response.json()) as PlexPlaylistResponse
  const playlists = data.MediaContainer.Metadata ?? []

  const matchingPlaylist = playlists.find(
    (playlist) => playlist.title === title,
  )

  return matchingPlaylist ? matchingPlaylist.ratingKey : null
}

/** Null when there is no token or Plex rejects the creation. */
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

    // Plex has no mixed playlist type, so mixed maps to video
    const playlistType = options.type === 'mixed' ? 'video' : options.type

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
        'X-Plex-Client-Identifier': PLEX_CLIENT_IDENTIFIER,
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

/** Only movies, shows and episodes across every page, and throws when there is no token or Plex fails. */
export async function getUserPlaylistItems(
  playlistId: string,
  serverUrl: string,
  token: string,
  log: FastifyBaseLogger,
): Promise<Set<PlexPlaylistItem>> {
  if (!token) {
    throw new Error('No token provided for playlist item retrieval')
  }

  const allItems = new Set<PlexPlaylistItem>()
  let offset = 0
  const limit = 100
  let hasMoreItems = true

  while (hasMoreItems) {
    const url = new URL(`/playlists/${playlistId}/items`, serverUrl)
    url.searchParams.append('X-Plex-Container-Start', offset.toString())
    url.searchParams.append('X-Plex-Container-Size', limit.toString())

    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'X-Plex-Token': token,
        'X-Plex-Client-Identifier': PLEX_CLIENT_IDENTIFIER,
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

    for (const item of items) {
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

    const currentSize = items.length
    const totalSize = data.MediaContainer.totalSize || items.length

    offset += currentSize
    hasMoreItems = offset < totalSize && currentSize > 0

    log.debug(
      `Fetched ${currentSize} playlist items, total so far: ${offset} of ${totalSize}`,
    )
  }

  log.debug(`Found ${allItems.size} items in playlist ${playlistId}`)
  return allItems
}
