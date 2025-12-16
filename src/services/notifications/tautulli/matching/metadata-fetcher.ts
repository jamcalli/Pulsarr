/**
 * Tautulli Metadata Fetcher
 *
 * Handles fetching metadata and recently added items from Tautulli.
 */

import type {
  RecentlyAddedItem,
  TautulliApiResponse,
  TautulliMetadata,
} from '@root/types/tautulli.types.js'
import type { FastifyBaseLogger } from 'fastify'

export type GetRecentlyAddedFn = (
  count?: number,
) => Promise<RecentlyAddedItem[]>

export interface MetadataFetcherDeps {
  apiCall: <T = unknown>(
    cmd: string,
    params?: Record<string, unknown>,
  ) => Promise<TautulliApiResponse<T>>
  log: FastifyBaseLogger
  isActive: () => boolean
}

/**
 * Get media metadata from Tautulli
 */
export async function getMetadata(
  ratingKey: string,
  deps: MetadataFetcherDeps,
): Promise<TautulliMetadata | null> {
  const { apiCall, log, isActive } = deps

  if (!isActive()) return null

  try {
    const response = await apiCall<TautulliMetadata>('get_metadata', {
      rating_key: ratingKey,
    })

    return response?.response?.data || null
  } catch (error) {
    log.error({ error, ratingKey }, 'Failed to get metadata from Tautulli')
    return null
  }
}

/**
 * Search for media by GUID
 */
export async function searchByGuid(
  guid: string,
  deps: MetadataFetcherDeps,
): Promise<TautulliMetadata | null> {
  const { apiCall, log, isActive } = deps

  if (!isActive()) return null

  try {
    const response = await apiCall<{ results: TautulliMetadata[] }>('search', {
      query: guid,
    })

    const results = response?.response?.data?.results || []
    return results[0] || null
  } catch (error) {
    log.error({ error, guid }, 'Failed to search Tautulli')
    return null
  }
}

/**
 * Get recently added items from Tautulli
 */
export async function getRecentlyAdded(
  count: number,
  deps: MetadataFetcherDeps,
): Promise<RecentlyAddedItem[]> {
  const { apiCall, log, isActive } = deps

  if (!isActive()) return []

  try {
    const response = await apiCall<{
      recently_added: RecentlyAddedItem[]
    }>('get_recently_added', {
      count,
      media_type: 'movie,show,season,episode',
    })

    return response?.response?.data?.recently_added || []
  } catch (error) {
    log.error({ error }, 'Failed to get recently added items from Tautulli')
    return []
  }
}

/**
 * Get poster URL through Tautulli's image proxy
 */
export function getPosterUrl(
  thumb: string,
  ratingKey: string,
  config: { url: string; apiKey: string },
): string {
  const params = new URLSearchParams({
    apikey: config.apiKey,
    cmd: 'pms_image_proxy',
    img: thumb,
    rating_key: ratingKey,
    width: '300',
    height: '450',
    fallback: 'poster',
  })

  return `${config.url}/api/v2?${params.toString()}`
}
