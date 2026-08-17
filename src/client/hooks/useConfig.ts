import { useCallback } from 'react'
import { queryClient } from '@/lib/queryClient'
import { $api, apiErrorMessage, apiFetch } from '@/lib/tanstackApi'
import type { components } from '@/types/api.js'

type ConfigFull = components['schemas']['Config']
type ConfigGetResponse = components['schemas']['ConfigResponse']
type ConfigUpdate = components['schemas']['ConfigUpdatePayload']

export const configKeys = {
  config: $api.queryOptions('get', '/v1/config').queryKey,
}

/**
 * Reads config from the query cache outside the render cycle, for
 * imperative flows that need the latest value without subscribing.
 */
export function getConfigSnapshot(): ConfigFull | null {
  return (
    queryClient.getQueryData<ConfigGetResponse>(configKeys.config)?.config ??
    null
  )
}

export function invalidateConfig() {
  return queryClient.invalidateQueries({ queryKey: configKeys.config })
}

/**
 * Persists config updates and writes the server's response straight into
 * the config query cache. Throws the parsed error body on failure.
 */
export async function updateConfig(updates: ConfigUpdate): Promise<void> {
  const { data, error } = await apiFetch.PUT('/v1/config', { body: updates })
  if (error) throw error

  queryClient.setQueryData<ConfigGetResponse>(configKeys.config, (prev) =>
    prev
      ? { ...prev, config: { ...prev.config, ...data.config } }
      : { success: true, config: data.config },
  )
}

export async function refreshRssFeeds(): Promise<void> {
  // RSS generation fails without Plex Pass - skip so setup can complete without feeds
  const { data, error } = await apiFetch.GET('/v1/plex/generate-rss-feeds')
  if (error) return

  if (data.self && data.friends) {
    await updateConfig({
      selfRss: data.self,
      friendsRss: data.friends,
    })
  }
}

/**
 * App configuration backed by the query cache. The query fetches once on
 * first mount and stays fresh through updateConfig's write-through, so
 * config is available on any page without explicit initialization.
 */
export function useConfig() {
  const query = $api.useQuery('get', '/v1/config', undefined, {
    staleTime: Number.POSITIVE_INFINITY,
  })

  const initialize = useCallback(async (force = false) => {
    if (force) {
      await queryClient.refetchQueries({ queryKey: configKeys.config })
    }
  }, [])

  return {
    config: query.data?.config ?? null,
    loading: query.isLoading,
    error: apiErrorMessage(query.error),
    isInitialized: query.data !== undefined,
    initialize,
  }
}
