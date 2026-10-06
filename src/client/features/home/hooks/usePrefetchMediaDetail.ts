import {
  DEFAULT_REGION,
  mediaDetailQuery,
} from '@/features/home/lib/media-detail-query'
import { type MediaItem, metadataGuid } from '@/features/home/lib/media-item'
import { useConfig } from '@/hooks/useConfig'
import { backdropUrl, posterCardUrl } from '@/lib/poster-url'
import { queryClient } from '@/lib/queryClient'

const preloadedGuids = new Set<string>()

function preloadImage(url: string | null) {
  if (url) new Image().src = url
}

/** Warms the detail dialog's metadata query and its hero images ahead of a click. */
export function usePrefetchMediaDetail() {
  const { config } = useConfig()

  return (item: MediaItem) => {
    const guid = metadataGuid(item)
    if (guid === null || config === null) return
    const options = mediaDetailQuery({
      guid,
      type: item.type,
      region: config.tmdbRegion ?? DEFAULT_REGION,
    })
    queryClient
      .fetchQuery(options)
      .then(({ metadata: { details } }) => {
        if (preloadedGuids.has(guid)) return
        preloadedGuids.add(guid)
        preloadImage(backdropUrl(details.backdrop_path))
        preloadImage(posterCardUrl(details.poster_path))
      })
      .catch(() => {})
  }
}
