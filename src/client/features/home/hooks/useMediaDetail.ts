import { useQuery } from '@tanstack/react-query'
import {
  DEFAULT_REGION,
  mediaDetailQuery,
} from '@/features/home/lib/media-detail-query'
import { useConfig } from '@/hooks/useConfig'
import { useMinLoading } from '@/hooks/useMinLoading'
import { apiErrorMessage } from '@/lib/tanstackApi'

export function useMediaDetail({
  open,
  guid,
  type,
}: {
  open: boolean
  guid: string | null
  type: 'movie' | 'show'
}) {
  const { config } = useConfig()
  const region = config?.tmdbRegion ?? DEFAULT_REGION

  const query = useMinLoading(
    useQuery({
      ...mediaDetailQuery({ guid: guid ?? '', type, region }),
      enabled: open && guid !== null && config !== null,
      placeholderData: (previous, previousQuery) =>
        previousQuery?.queryKey[2]?.params.path.id === guid
          ? previous
          : undefined,
    }),
  )

  const notFound = query.error?.statusCode === 404
  const errorMessage =
    guid === null
      ? 'This title has no TMDB or TVDB id to look up.'
      : query.isError && !notFound
        ? (apiErrorMessage(query.error) ?? 'Details failed to load.')
        : null

  return {
    region,
    metadata: query.data?.metadata,
    notFound,
    errorMessage,
  }
}
