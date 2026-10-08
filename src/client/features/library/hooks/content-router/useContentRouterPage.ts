import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useConditionCatalog } from '@/features/library/hooks/content-router/useConditionCatalog'
import {
  deleteRule,
  useContentRouterRules,
} from '@/features/library/hooks/content-router/useContentRouterRules'
import { useRouteTargets } from '@/features/library/hooks/content-router/useRouteTargets'
import type { RouteType } from '@/features/library/lib/content-router/condition-fields'
import { usesField } from '@/features/library/lib/content-router/route-form'
import { routesFor } from '@/features/library/lib/content-router/route-list'
import { useDirtyGuard } from '@/hooks/useDirtyGuard'
import { useLeaveGuard } from '@/hooks/useLeaveGuard'
import { useMinLoadingMutation, withMinDuration } from '@/hooks/useMinLoading'
import { mutationErrorMessage } from '@/lib/tanstackApi'
import type { components } from '@/types/api.js'

type RouterRule = components['schemas']['RouterRule']

/** The open card, a stored rule's id or `new` for the route being created. */
export type OpenKey = number | 'new' | null

export function useContentRouterPage() {
  const rulesState = useContentRouterRules()
  const [searchParams, setSearchParams] = useSearchParams()
  const type: RouteType =
    searchParams.get('type') === 'sonarr' ? 'sonarr' : 'radarr'
  const [opened, setOpened] = useState<{ type: RouteType; key: OpenKey }>({
    type,
    key: null,
  })
  const openKey = opened.type === type ? opened.key : null
  const setOpenKey = (key: OpenKey) => setOpened({ type, key })
  const [deleting, setDeleting] = useState<RouterRule | null>(null)
  const guard = useDirtyGuard()
  const leaveGuard = useLeaveGuard(guard.dirty)

  const routes = rulesState.rules ? routesFor(rulesState.rules, type) : []
  const editing = openKey !== null
  const catalog = useConditionCatalog(type, {
    genres: editing,
    providers:
      editing ||
      routes.some((rule) => usesField(rule.condition, 'streamingServices')),
  })
  const targets = useRouteTargets(
    type,
    routes.flatMap((rule) =>
      rule.exclude_from_routing || rule.target_instance_id === null
        ? []
        : [rule.target_instance_id],
    ),
  )

  const removal = useMinLoadingMutation(
    useMutation({
      mutationFn: (id: number) => withMinDuration(deleteRule(id)),
      onSuccess: () => {
        setDeleting(null)
        guard.setDirty(false)
        setOpenKey(null)
      },
    }),
  )

  const counts: Record<RouteType, number> = {
    radarr: rulesState.rules ? routesFor(rulesState.rules, 'radarr').length : 0,
    sonarr: rulesState.rules ? routesFor(rulesState.rules, 'sonarr').length : 0,
  }

  const loadError =
    rulesState.errorMessage ??
    catalog.errorMessage ??
    targets.instances.errorMessage
  const loaded =
    rulesState.rules !== null &&
    catalog.hasMetadata &&
    targets.instances.hasData

  return {
    type,
    routes,
    counts,
    openKey,
    catalog,
    targets,
    loaded,
    loadError,
    retry: () => {
      if (rulesState.errorMessage) rulesState.retry()
      if (catalog.errorMessage) catalog.retry()
      if (targets.instances.errorMessage) targets.instances.retry()
    },
    routeSwitch: {
      onChange: (id: number, enabled: boolean) =>
        void rulesState.toggle(id, enabled),
      error: rulesState.toggleError,
      pending: rulesState.isToggling,
    },
    guard,
    leaveGuard,
    selectType: (next: RouteType) => {
      if (next === type) return
      guard.run(() => {
        setOpenKey(null)
        setSearchParams({ type: next }, { replace: true })
      })
    },
    open: (key: Exclude<OpenKey, null>) => {
      if (key === openKey) return
      guard.run(() => setOpenKey(key))
    },
    collapse: () => guard.run(() => setOpenKey(null)),
    close: () => {
      guard.setDirty(false)
      setOpenKey(null)
    },
    deleting,
    requestDelete: (rule: RouterRule) => {
      removal.reset()
      setDeleting(rule)
    },
    cancelDelete: () => {
      if (!removal.isPending) setDeleting(null)
    },
    confirmDelete: () => {
      if (deleting) removal.mutate(deleting.id)
    },
    deletePending: removal.isPending,
    deleteError: removal.error
      ? mutationErrorMessage(
          removal.error,
          'The route was not deleted. Try again.',
        )
      : null,
  }
}
