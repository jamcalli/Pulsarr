import type {
  RadarrInstanceCreateResponse,
  RadarrInstanceUpdate,
} from '@root/schemas/radarr/radarr-instance.schema'
import { useMutation } from '@tanstack/react-query'
import { invalidateArrInstances } from '@/features/arr/instanceMutations'
import { $api, apiFetch } from '@/lib/tanstackApi'
import { useMinLoading, useMinLoadingMutation } from '@/lib/useMinLoading'

export function useRadarrInstancesQuery() {
  return useMinLoading($api.useQuery('get', '/v1/radarr/instances'))
}

export async function testRadarrConnection(baseUrl: string, apiKey: string) {
  const { data, error } = await apiFetch.POST('/v1/radarr/test-connection', {
    body: { baseUrl, apiKey },
  })
  if (error) throw error
  return data
}

export async function createRadarrInstance(
  instance: RadarrInstanceUpdate & {
    name: string
    baseUrl: string
    apiKey: string
  },
): Promise<RadarrInstanceCreateResponse> {
  const { data, error } = await apiFetch.POST('/v1/radarr/instances', {
    body: instance,
  })
  if (error) throw error
  await invalidateArrInstances('radarr')
  return data
}

async function putRadarrInstance(id: number, body: RadarrInstanceUpdate) {
  const { error } = await apiFetch.PUT('/v1/radarr/instances/{id}', {
    params: { path: { id } },
    body,
  })
  if (error) throw error
}

export async function updateRadarrInstance(
  id: number,
  updates: RadarrInstanceUpdate,
): Promise<void> {
  // Promotion is atomic server-side: setting isDefault demotes every other
  // instance and clears their synced instances in the same transaction
  // Spread carries syncedInstances only when the caller sets it - defaulting
  // to [] here would clear assignments on unrelated updates
  await putRadarrInstance(id, {
    ...updates,
    name: updates.name?.trim(),
  })
  await invalidateArrInstances('radarr')
}

export function useUpdateRadarrInstanceMutation() {
  return useMinLoadingMutation(
    useMutation({
      mutationFn: ({
        id,
        updates,
      }: {
        id: number
        updates: RadarrInstanceUpdate
      }) => updateRadarrInstance(id, updates),
    }),
  )
}

export function useDeleteRadarrInstanceMutation() {
  return useMinLoadingMutation(
    useMutation({
      mutationFn: async (id: number) => {
        const { error } = await apiFetch.DELETE('/v1/radarr/instances/{id}', {
          params: { path: { id } },
        })
        if (error) throw error
      },
      onSuccess: () => invalidateArrInstances('radarr'),
    }),
  )
}
