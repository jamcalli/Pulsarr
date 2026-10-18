import {
  placeholderRadarrInstance,
  placeholderSonarrInstance,
} from '@root/schemas/common/arr-placeholder'
import { useMemo } from 'react'
import {
  type ArrType,
  type InstanceFormValues,
  radarrBody,
  sonarrBody,
} from '@/features/library/lib/instances/instance-form'
import { useArrInstances } from '@/hooks/useArrInstances'
import { type ArrTarget, isConfiguredTarget } from '@/lib/approval'
import { compareText } from '@/lib/format'
import { queryClient } from '@/lib/queryClient'
import { $api, apiFetch } from '@/lib/tanstackApi'
import type { components } from '@/types/api.js'

type RadarrList = components['schemas']['RadarrInstanceListResponse']
type SonarrList = components['schemas']['SonarrInstanceListResponse']

function instancesKey(type: ArrType) {
  return type === 'radarr'
    ? $api.queryOptions('get', '/v1/radarr/instances').queryKey
    : $api.queryOptions('get', '/v1/sonarr/instances').queryKey
}

function byDefaultThenName(a: ArrTarget, b: ArrTarget): number {
  if (a.instance.isDefault !== b.instance.isDefault) {
    return a.instance.isDefault ? -1 : 1
  }
  return compareText(a.instance.name, b.instance.name)
}

export async function refreshInstances(type: ArrType): Promise<ArrTarget[]> {
  await queryClient.invalidateQueries({ queryKey: instancesKey(type) })
  const targets: ArrTarget[] =
    type === 'radarr'
      ? (queryClient.getQueryData<RadarrList>(instancesKey(type)) ?? []).map(
          (instance) => ({ type, instance }),
        )
      : (queryClient.getQueryData<SonarrList>(instancesKey(type)) ?? []).map(
          (instance) => ({ type, instance }),
        )
  return targets.filter(isConfiguredTarget)
}

type ArrInstanceConflict = components['schemas']['ArrInstanceConflict']
type SaveError = components['schemas']['Error'] | ArrInstanceConflict

/** Hands back a webhook callback conflict instead of throwing it, every other error throws. */
function callbackConflict(
  error: SaveError | undefined,
): ArrInstanceConflict | null {
  if (!error) return null
  if ('code' in error && error.code === 'webhook_callback_failed') return error
  throw error
}

export async function createInstance(
  type: ArrType,
  values: InstanceFormValues,
): Promise<ArrInstanceConflict | null> {
  const { error } =
    type === 'radarr'
      ? await apiFetch.POST('/v1/radarr/instances', {
          body: radarrBody(values),
        })
      : await apiFetch.POST('/v1/sonarr/instances', {
          body: sonarrBody(values),
        })
  return callbackConflict(error)
}

export async function updateInstance(
  type: ArrType,
  id: number,
  values: InstanceFormValues,
): Promise<ArrInstanceConflict | null> {
  const params = { path: { id } }
  const { error } =
    type === 'radarr'
      ? await apiFetch.PUT('/v1/radarr/instances/{id}', {
          params,
          body: radarrBody(values),
        })
      : await apiFetch.PUT('/v1/sonarr/instances/{id}', {
          params,
          body: sonarrBody(values),
        })
  return callbackConflict(error)
}

/** The last instance is reset to the placeholder row instead of deleted. */
export async function removeInstance(
  type: ArrType,
  id: number,
  last: boolean,
): Promise<void> {
  const params = { path: { id } }
  if (last) {
    const { error } =
      type === 'radarr'
        ? await apiFetch.PUT('/v1/radarr/instances/{id}', {
            params,
            body: placeholderRadarrInstance(),
          })
        : await apiFetch.PUT('/v1/sonarr/instances/{id}', {
            params,
            body: placeholderSonarrInstance(),
          })
    if (error) throw error
    return
  }
  const { error } =
    type === 'radarr'
      ? await apiFetch.DELETE('/v1/radarr/instances/{id}', { params })
      : await apiFetch.DELETE('/v1/sonarr/instances/{id}', { params })
  if (error) throw error
}

export function useInstances(type: ArrType) {
  const list = useArrInstances(type)
  const instances = useMemo(
    () => [...list.configuredTargets].sort(byDefaultThenName),
    [list.configuredTargets],
  )
  const placeholder =
    list.targets.find((target) => !isConfiguredTarget(target)) ?? null

  return {
    instances,
    placeholder,
    isPlaceholderOnly: list.hasData && instances.length === 0,
    hasData: list.hasData,
    errorMessage: list.errorMessage,
    retry: list.retry,
  }
}
