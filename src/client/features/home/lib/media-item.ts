import type { RecentRequest } from '@/features/home/hooks/useRecentRequests'
import type { components } from '@/types/api.js'

type RankedContent = components['schemas']['ContentStat']

export interface MediaItem {
  title: string
  type: 'movie' | 'show'
  guids: string[]
  thumb: string | null
  request?: RecentRequest
  watchers?: string[]
}

const TMDB_GUID = /^tmdb:\d+$/
const TVDB_GUID = /^tvdb:\d+$/

/** Shows prefer TVDB because TMDB show ids collide with movie ids. Null when neither id is present. */
export function metadataGuid(
  item: Pick<MediaItem, 'type' | 'guids'>,
): string | null {
  const guids = item.guids.map((guid) => guid.trim().toLowerCase())
  const tmdb = guids.find((guid) => TMDB_GUID.test(guid))
  const tvdb = guids.find((guid) => TVDB_GUID.test(guid))
  return (item.type === 'show' ? (tvdb ?? tmdb) : (tmdb ?? tvdb)) ?? null
}

export function recentRequestItem(request: RecentRequest): MediaItem {
  return {
    title: request.title,
    type: request.contentType,
    guids: request.guids,
    thumb: request.thumb,
    request,
  }
}

/** Joins a loaded recent request by title and type, since rankings carry no request id. */
export function rankingItem(
  content: RankedContent,
  requests: RecentRequest[] = [],
): MediaItem {
  return {
    title: content.title,
    type: content.content_type,
    guids: content.guids ?? [],
    thumb: content.thumb,
    request: requests.find(
      (request) =>
        request.title === content.title &&
        request.contentType === content.content_type,
    ),
    watchers: content.users ?? [],
  }
}
