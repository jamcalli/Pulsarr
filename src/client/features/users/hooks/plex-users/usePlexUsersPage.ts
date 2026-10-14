import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import type { PageSize } from '@/components/data-table/page-size'
import { usePlexUsersList } from '@/features/users/hooks/plex-users/usePlexUsersList'
import {
  BULK_ERROR_FALLBACK,
  bulkUserFailure,
} from '@/features/users/lib/plex-users/bulk-actions'
import { hasPlexToken } from '@/features/users/lib/plex-users/plex-connection'
import { visibleRows } from '@/features/users/lib/plex-users/user-rows'
import {
  filterCount,
  hasFilters,
  parseUsersState,
  plexUsersPageSizePref,
  selectionScope,
  serializeUsersState,
  USERS_SORTABLE,
  type UsersState,
  withoutFilters,
} from '@/features/users/lib/plex-users/users-state'
import { invalidatePlexUsers } from '@/features/users/lib/users-queries'
import { useConfig } from '@/hooks/useConfig'
import { useMinLoadingMutation, withMinDuration } from '@/hooks/useMinLoading'
import { useScopedSelection } from '@/hooks/useScopedSelection'
import { useUrlState } from '@/hooks/useUrlState'
import { paginate } from '@/lib/paginate'
import { usePref } from '@/lib/prefs'
import {
  apiFetch,
  mutationErrorMessage,
  requireSuccess,
} from '@/lib/tanstackApi'
import type { components, paths } from '@/types/api.js'

type BulkUserUpdates =
  paths['/v1/users/bulk']['patch']['requestBody']['content']['application/json']['updates']
type BulkQuotaPayload = components['schemas']['UserQuotaBulkOperationPayload']

export type BulkRequest =
  | { kind: 'settings'; userIds: number[]; updates: BulkUserUpdates }
  | { kind: 'quotas'; payload: BulkQuotaPayload }

/** Resolves to the ids the server could not update. */
async function runBulk(request: BulkRequest): Promise<number[]> {
  if (request.kind === 'settings') {
    const { data, error } = await apiFetch.PATCH('/v1/users/bulk', {
      body: { userIds: request.userIds, updates: request.updates },
    })
    if (error) throw error
    return requireSuccess(data).failedIds ?? []
  }
  const { data, error } = await apiFetch.PATCH('/v1/quota/users/bulk', {
    body: request.payload,
  })
  if (error) throw error
  return requireSuccess(data).failedIds ?? []
}

export function usePlexUsersPage() {
  const { state, setState, pageHref } = useUrlState(
    parseUsersState,
    serializeUsersState,
  )
  const [pageSize, savePageSize] = usePref(plexUsersPageSizePref)
  const list = usePlexUsersList()
  const config = useConfig()
  const selection = useScopedSelection(selectionScope(state, pageSize))
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [quotasOpen, setQuotasOpen] = useState(false)

  const matching = list.rows === null ? null : visibleRows(list.rows, state)
  const total = matching?.length ?? 0
  const paged = paginate(matching ?? [], state.page, pageSize)
  const page = paged.page
  const rows = matching === null ? null : paged.rows
  const selected = (rows ?? []).filter(
    (row) => selection.rows[String(row.user.id)],
  )

  const bulk = useMinLoadingMutation(
    useMutation({
      mutationFn: (request: BulkRequest) => withMinDuration(runBulk(request)),
      onSettled: () => {
        setSettingsOpen(false)
        setQuotasOpen(false)
        return invalidatePlexUsers()
      },
    }),
  )

  return {
    state,
    page,
    pageHref,
    rows,
    total,
    untracked: list.untracked,
    isLoading: list.isLoading,
    isReady: list.isReady && config.isReady,
    plexConnected: config.config === null || hasPlexToken(config.config),
    errorMessage: list.errorMessage ?? config.error,
    retry: () => {
      list.retry()
      if (config.isError) void config.initialize(true)
    },
    filtered: hasFilters(state),
    filterCount: filterCount(state),
    sortKeys: USERS_SORTABLE,
    update: (patch: Partial<UsersState>) =>
      setState({ ...state, page: 1, ...patch }),
    clearFilters: () => setState(withoutFilters(state)),
    setPage: (next: number) => setState({ ...state, page: next }),
    pageSize,
    setPageSize: (size: PageSize) => {
      savePageSize(size)
      setState({ ...state, page: 1 })
    },
    selection: selection.rows,
    selected,
    failure: selection.failure,
    setSelection: selection.select,
    clearSelection: selection.clear,
    settingsOpen,
    quotasOpen,
    openSettings: () => {
      bulk.reset()
      selection.setFailure(null)
      setSettingsOpen(true)
    },
    openQuotas: () => {
      bulk.reset()
      selection.setFailure(null)
      setQuotasOpen(true)
    },
    setSettingsOpen: (open: boolean) => {
      if (!bulk.isPending) setSettingsOpen(open)
    },
    setQuotasOpen: (open: boolean) => {
      if (!bulk.isPending) setQuotasOpen(open)
    },
    runBulk: (request: BulkRequest) =>
      bulk.mutate(request, {
        onSuccess: (failedIds) =>
          selection.settle(failedIds, bulkUserFailure(failedIds, selected)),
        onError: (error) =>
          selection.setFailure({
            message: mutationErrorMessage(error, BULK_ERROR_FALLBACK),
            detail: null,
          }),
      }),
    bulkPending: bulk.isPending,
  }
}

export type PlexUsersPage = ReturnType<typeof usePlexUsersPage>
