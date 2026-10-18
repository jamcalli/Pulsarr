import { useMemo, useState } from 'react'
import type { PageSize } from '@/components/data-table/page-size'
import { useRollingShowActions } from '@/features/library/hooks/session-monitoring/useRollingShowActions'
import { useRollingShows } from '@/features/library/hooks/session-monitoring/useRollingShows'
import {
  type RollingShowRow,
  visibleShows,
} from '@/features/library/lib/session-monitoring/rolling-shows'
import { savedSessionMonitoring } from '@/features/library/lib/session-monitoring/saved-settings'
import {
  expansionScope,
  filterCount,
  hasFilters,
  parseShowsState,
  rollingShowsPageSizePref,
  SHOWS_SORTABLE,
  type ShowsState,
  serializeShowsState,
  withoutFilters,
} from '@/features/library/lib/session-monitoring/shows-state'
import { useConfig } from '@/hooks/useConfig'
import { useUrlState } from '@/hooks/useUrlState'
import { paginate } from '@/lib/paginate'
import { usePref } from '@/lib/prefs'

export type ShowConfirm =
  | { kind: 'reset' | 'stop'; row: RollingShowRow }
  | { kind: 'resetInactive'; titles: string[] }

export function useSessionMonitoringPage() {
  const { state, setState, pageHref } = useUrlState(
    parseShowsState,
    serializeShowsState,
  )
  const [pageSize, savePageSize] = usePref(rollingShowsPageSizePref)
  const config = useConfig()
  const saved = config.config ? savedSessionMonitoring(config.config) : null
  const list = useRollingShows(saved?.inactivityResetDays ?? null)
  const actions = useRollingShowActions()
  const scope = expansionScope(state, pageSize)
  const [expanded, setExpanded] = useState<{
    scope: string
    id: string | null
  }>({ scope, id: null })
  const [confirm, setConfirm] = useState<{
    open: boolean
    target: ShowConfirm | null
  }>({ open: false, target: null })

  const all = list.rows
  const matching = useMemo(
    () => (all === null ? null : visibleShows(all, state)),
    [all, state],
  )
  const total = matching?.length ?? 0
  const paged = paginate(matching ?? [], state.page, pageSize)
  const page = paged.page
  const rows = matching === null ? null : paged.rows
  const inactive = useMemo(
    () => (all ?? []).filter((row) => row.inactive),
    [all],
  )

  return {
    config: config.config,
    state,
    page,
    pageHref,
    all,
    rows,
    total,
    inactive,
    isReady: config.isReady && (config.isError || list.isReady),
    errorMessage: config.error ?? list.errorMessage,
    retry: () => {
      if (config.isError) void config.initialize(true)
      list.retry()
    },
    filtered: hasFilters(state),
    filterCount: filterCount(state),
    sortKeys: SHOWS_SORTABLE,
    update: (patch: Partial<ShowsState>) =>
      setState({ ...state, page: 1, ...patch }),
    clearFilters: () => setState(withoutFilters(state)),
    setPage: (next: number) => setState({ ...state, page: next }),
    pageSize,
    setPageSize: (size: PageSize) => {
      savePageSize(size)
      setState({ ...state, page: 1 })
    },
    expandedId: expanded.scope === scope ? expanded.id : null,
    setExpandedId: (id: string | null) => setExpanded({ scope, id }),
    confirm,
    openConfirm: (target: ShowConfirm) => {
      actions.reset()
      setConfirm({ open: true, target })
    },
    setConfirmOpen: (open: boolean) =>
      setConfirm((prev) => ({ ...prev, open })),
    runConfirm: () => {
      const { target } = confirm
      if (!target || !saved) return
      const onSuccess = () => setConfirm((prev) => ({ ...prev, open: false }))
      if (target.kind === 'resetInactive') {
        actions.run(
          { kind: 'resetInactive', inactivityDays: saved.inactivityResetDays },
          { onSuccess },
        )
        return
      }
      actions.run(
        { kind: target.kind, id: target.row.record.id },
        { onSuccess },
      )
    },
    actionPending: actions.pending,
    actionError: actions.errorMessage,
  }
}

export type SessionMonitoringPage = ReturnType<typeof useSessionMonitoringPage>
