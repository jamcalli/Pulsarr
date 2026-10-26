import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import type { SaveOutcome } from '@/hooks/arr/useInstanceForm'
import { useInstanceHealth } from '@/hooks/arr/useInstanceHealth'
import {
  refreshInstances,
  removeInstance,
  useInstances,
} from '@/hooks/arr/useInstances'
import { useConfig } from '@/hooks/useConfig'
import { useDirtyGuard } from '@/hooks/useDirtyGuard'
import { useMinLoadingMutation, withMinDuration } from '@/hooks/useMinLoading'
import { useQualityProfileNames } from '@/hooks/useQualityProfileNames'
import type { ArrTarget } from '@/lib/approval'
import { INSTANCE_COPY } from '@/lib/arr/instance-copy'
import type { ArrType, EditTarget } from '@/lib/arr/instance-form'
import { mutationErrorMessage } from '@/lib/tanstackApi'

/** The open card, a saved instance's id or `new` for the one being added. */
export type OpenKey = number | 'new' | null

export function useInstancesPage(type: ArrType) {
  const list = useInstances(type)
  const { config, error: configError, initialize } = useConfig()
  const [openKey, setOpenKey] = useState<OpenKey>(null)
  const [removing, setRemoving] = useState<ArrTarget | null>(null)
  const guard = useDirtyGuard()
  const health = useInstanceHealth(type, list.instances)
  const profiles = useQualityProfileNames(
    type,
    list.instances.map(({ instance }) => instance.id),
  )

  const removal = useMinLoadingMutation(
    useMutation({
      mutationFn: (target: ArrTarget) =>
        withMinDuration(
          removeInstance(
            type,
            target.instance.id,
            list.instances.length === 1,
          ).then(() => refreshInstances(type)),
        ),
      onSuccess: () => {
        setRemoving(null)
        guard.setDirty(false)
        setOpenKey(null)
      },
    }),
  )

  const openTarget =
    typeof openKey === 'number'
      ? (list.instances.find(({ instance }) => instance.id === openKey) ?? null)
      : null
  const edit: EditTarget | null =
    openKey === 'new'
      ? {
          kind: 'new',
          first: list.isPlaceholderOnly,
          placeholderId: list.isPlaceholderOnly
            ? (list.placeholder?.instance.id ?? null)
            : null,
        }
      : openTarget && { kind: 'saved', target: openTarget }

  const listFailed = !list.hasData && list.errorMessage !== null

  const close = () => {
    guard.setDirty(false)
    setOpenKey(null)
  }

  return {
    type,
    list,
    config,
    loaded: list.hasData && config !== null,
    loadError: listFailed
      ? INSTANCE_COPY[type].loadError
      : config
        ? null
        : configError,
    retry: () => {
      if (list.errorMessage) list.retry()
      if (!config) void initialize(true)
    },
    health,
    profileName: profiles.profileName,
    openKey,
    edit,
    guard,
    open: (key: Exclude<OpenKey, null>) => {
      if (key === openKey) return
      guard.run(() => setOpenKey(key))
    },
    collapse: () => guard.run(() => setOpenKey(null)),
    close,
    onSaved: ({ savedId }: SaveOutcome) => {
      if (savedId === null) close()
    },
    removing,
    requestRemove: (target: ArrTarget) => {
      removal.reset()
      setRemoving(target)
    },
    cancelRemove: () => {
      if (!removal.isPending) setRemoving(null)
    },
    confirmRemove: () => {
      if (removing) removal.mutate(removing)
    },
    removePending: removal.isPending,
    removeError: removal.error
      ? mutationErrorMessage(
          removal.error,
          'The instance was not removed. Try again.',
        )
      : null,
  }
}

export type InstancesPage = ReturnType<typeof useInstancesPage>
