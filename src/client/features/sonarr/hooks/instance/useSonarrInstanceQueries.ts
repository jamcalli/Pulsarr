import type {
  SonarrInstanceCreateResponse,
  SonarrInstanceUpdate,
} from '@root/schemas/sonarr/sonarr-instance.schema'
import { useMutation } from '@tanstack/react-query'
import { invalidateArrInstances } from '@/features/arr/instanceMutations'
import { $api, apiFetch } from '@/lib/tanstackApi'
import { useMinLoading, useMinLoadingMutation } from '@/lib/useMinLoading'

export function useSonarrInstancesQuery() {
  return useMinLoading($api.useQuery('get', '/v1/sonarr/instances'))
}

export async function testSonarrConnection(baseUrl: string, apiKey: string) {
  const { data, error } = await apiFetch.POST('/v1/sonarr/test-connection', {
    body: { baseUrl, apiKey },
  })
  if (error) throw error
  return data
}

export async function createSonarrInstance(
  instance: SonarrInstanceUpdate & {
    name: string
    baseUrl: string
    apiKey: string
  },
): Promise<SonarrInstanceCreateResponse> {
  const { data, error } = await apiFetch.POST('/v1/sonarr/instances', {
    body: instance,
  })
  if (error) throw error
  await invalidateArrInstances('sonarr')
  return data
}

async function putSonarrInstance(id: number, body: SonarrInstanceUpdate) {
  const { error } = await apiFetch.PUT('/v1/sonarr/instances/{id}', {
    params: { path: { id } },
    body,
  })
  if (error) throw error
}

export async function updateSonarrInstance(
  id: number,
  updates: SonarrInstanceUpdate,
): Promise<void> {
  // Promotion is atomic server-side: setting isDefault demotes every other
  // instance and clears their synced instances in the same transaction
  // Spread carries syncedInstances only when the caller sets it - defaulting
  // to [] here would clear assignments on unrelated updates
  await putSonarrInstance(id, {
    ...updates,
    name: updates.name?.trim(),
  })
  await invalidateArrInstances('sonarr')
}

export function useUpdateSonarrInstanceMutation() {
  return useMinLoadingMutation(
    useMutation({
      mutationFn: ({
        id,
        updates,
      }: {
        id: number
        updates: SonarrInstanceUpdate
      }) => updateSonarrInstance(id, updates),
    }),
  )
}

export function useDeleteSonarrInstanceMutation() {
  return useMinLoadingMutation(
    useMutation({
      mutationFn: async (id: number) => {
        const { error } = await apiFetch.DELETE('/v1/sonarr/instances/{id}', {
          params: { path: { id } },
        })
        if (error) throw error
      },
      onSuccess: () => invalidateArrInstances('sonarr'),
    }),
  )
}
