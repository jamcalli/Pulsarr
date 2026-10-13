import { $api } from '@/lib/tanstackApi'

const METADATA_STALE_MS = 60 * 60 * 1000
export const DEFAULT_REGION = 'US'

/** Shared by the dialog and hover prefetch so both read and write the same cache entry. */
export function mediaDetailQuery({
  guid,
  type,
  region,
}: {
  guid: string
  type: 'movie' | 'show'
  region: string
}) {
  return $api.queryOptions(
    'get',
    '/v1/tmdb/metadata/{id}',
    { params: { path: { id: guid }, query: { region, type } } },
    {
      staleTime: METADATA_STALE_MS,
      retry: (failureCount, error) =>
        error.statusCode !== 404 && failureCount < 1,
    },
  )
}
