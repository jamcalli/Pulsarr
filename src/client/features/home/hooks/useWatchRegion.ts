import { useMutation } from '@tanstack/react-query'
import { DEFAULT_REGION } from '@/features/home/lib/media-detail-query'
import { updateConfig, useConfig } from '@/hooks/useConfig'
import { useMinLoadingMutation } from '@/hooks/useMinLoading'
import { $api, mutationErrorMessage } from '@/lib/tanstackApi'

export function useWatchRegion(enabled: boolean) {
  const { config } = useConfig()
  const regions = $api.useQuery('get', '/v1/tmdb/regions', undefined, {
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
  })
  const save = useMinLoadingMutation(
    useMutation({
      mutationFn: (tmdbRegion: string) => updateConfig({ tmdbRegion }),
    }),
  )

  const region = save.isPending
    ? (save.variables ?? DEFAULT_REGION)
    : (config?.tmdbRegion ?? DEFAULT_REGION)
  const loaded = regions.data?.regions
  const options = loaded
    ? [...loaded]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((entry) => ({ value: entry.code, label: entry.name }))
    : [{ value: region, label: region }]

  return {
    region,
    options,
    ready: loaded !== undefined && config !== null,
    setRegion: (next: string) => save.mutate(next),
    isSaving: save.isPending,
    errorMessage:
      save.isPending || !save.error
        ? null
        : mutationErrorMessage(save.error, 'Region was not saved. Try again.'),
  }
}
