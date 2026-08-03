import type {
  SonarrInstanceCreateResponse,
  SonarrInstanceResponse,
  SonarrInstanceUpdate,
} from '@root/schemas/sonarr/sonarr-instance.schema'
import { useMutation } from '@tanstack/react-query'
import {
  clearOtherDefaults,
  invalidateArrInstances,
} from '@/features/arr/instanceMutations'
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
  instances: SonarrInstanceResponse[],
  id: number,
  updates: SonarrInstanceUpdate,
): Promise<void> {
  await clearOtherDefaults(instances, id, updates.isDefault, (inst) =>
    putSonarrInstance(inst.id, {
      ...inst,
      isDefault: false,
      syncedInstances: [],
    }),
  )
  await putSonarrInstance(id, {
    ...updates,
    name: updates.name?.trim(),
    syncedInstances: updates.syncedInstances || [],
  })
  await invalidateArrInstances('sonarr')
}

export function useUpdateSonarrInstanceMutation() {
  const { data: instances } = useSonarrInstancesQuery()
  return useMinLoadingMutation(
    useMutation({
      mutationFn: ({
        id,
        updates,
      }: {
        id: number
        updates: SonarrInstanceUpdate
      }) => updateSonarrInstance(instances ?? [], id, updates),
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
