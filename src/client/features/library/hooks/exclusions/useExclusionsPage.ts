import { useCallback, useEffect, useState } from 'react'
import type { PageSize } from '@/components/data-table/page-size'
import {
  type BulkJob,
  type SingleTarget,
  useBulkExclusionAction,
  useSingleExclusionAction,
} from '@/features/library/hooks/exclusions/useExclusionActions'
import { useExclusionItems } from '@/features/library/hooks/exclusions/useExclusionItems'
import {
  EXCLUDE_ERROR_FALLBACK,
  REMOVE_ERROR_FALLBACK,
} from '@/features/library/lib/exclusions/exclusion-copy'
import { exclusionIds } from '@/features/library/lib/exclusions/exclusion-rows'
import {
  EXCLUSIONS_SORTABLE,
  type ExclusionsState,
  exclusionsPageSizePref,
  expansionScope,
  filterCount,
  hasFilters,
  parseExclusionsState,
  selectionScope,
  serializeExclusionsState,
  withoutFilters,
} from '@/features/library/lib/exclusions/exclusions-state'
import { useScopedSelection } from '@/hooks/useScopedSelection'
import { useUrlState } from '@/hooks/useUrlState'
import { usePref } from '@/lib/prefs'
import { mutationErrorMessage } from '@/lib/tanstackApi'
import type { components } from '@/types/api.js'

type ExclusionItem = components['schemas']['WatchlistExclusionItem']
type ExclusionScope = components['schemas']['WatchlistExclusionScope']
type BulkKind = BulkJob['kind']

/** `dirty` is the Maintainerr form's, which freezes the table and drops its selection. */
export function useExclusionsPage(dirty: boolean) {
  const { state, setState, pageHref } = useUrlState(
    parseExclusionsState,
    serializeExclusionsState,
  )
  const [pageSize, savePageSize] = usePref(exclusionsPageSizePref)
  const list = useExclusionItems(state, pageSize)
  const selection = useScopedSelection(selectionScope(state, pageSize, dirty))
  const scope = expansionScope(state, pageSize)
  const [expanded, setExpanded] = useState<{
    scope: string
    id: string | null
  }>({ scope, id: null })
  const [single, setSingle] = useState<{
    open: boolean
    target: SingleTarget | null
  }>({ open: false, target: null })
  const [bulkConfirm, setBulkConfirm] = useState<{
    kind: BulkKind
    items: ExclusionItem[]
    open: boolean
  }>({ kind: 'exclude', items: [], open: false })
  const singleAction = useSingleExclusionAction()
  const bulkAction = useBulkExclusionAction()

  const rows = list.rows ?? []
  const selected = rows.filter((row) => selection.rows[row.key])
  const lastPage = Math.max(1, Math.ceil(list.total / pageSize))

  useEffect(() => {
    if (list.rows?.length === 0 && state.page > lastPage) {
      setState({ ...state, page: lastPage })
    }
  }, [list.rows, state, lastPage, setState])

  const singleKind = singleAction.variables?.kind
  const resetSingle = singleAction.reset
  const openSingle = useCallback(
    (target: SingleTarget) => {
      resetSingle()
      setSingle({ open: true, target })
    },
    [resetSingle],
  )

  return {
    state,
    pageHref,
    rows: list.rows,
    total: list.total,
    isReady: list.isReady,
    stale: list.stale,
    errorMessage: list.errorMessage,
    retry: list.retry,
    locked: dirty,
    filtered: hasFilters(state),
    filterCount: filterCount(state),
    sortKeys: EXCLUSIONS_SORTABLE,
    update: (patch: Partial<ExclusionsState>) =>
      setState({ ...state, page: 1, ...patch }),
    clearFilters: () => setState(withoutFilters(state)),
    setPage: (page: number) => setState({ ...state, page }),
    pageSize,
    setPageSize: (size: PageSize) => {
      savePageSize(size)
      setState({ ...state, page: 1 })
    },
    expandedId: expanded.scope === scope ? expanded.id : null,
    setExpandedId: (id: string | null) => setExpanded({ scope, id }),
    selection: selection.rows,
    selected,
    failure: selection.failure,
    setSelection: selection.select,
    clearSelection: selection.clear,
    canRemove: selected.some((row) => exclusionIds(row).length > 0),
    single,
    /** Stable, so the columns built from it keep their cells mounted. */
    openSingle,
    setSingleOpen: (open: boolean) => {
      if (!singleAction.isPending) setSingle((prev) => ({ ...prev, open }))
    },
    runSingle: () => {
      if (!single.target) return
      singleAction.mutate(single.target, {
        onSuccess: () => setSingle((prev) => ({ ...prev, open: false })),
      })
    },
    singlePending: singleAction.isPending,
    singleError:
      singleAction.isError && singleKind
        ? mutationErrorMessage(
            singleAction.error,
            singleKind.startsWith('exclude')
              ? EXCLUDE_ERROR_FALLBACK
              : REMOVE_ERROR_FALLBACK,
          )
        : null,
    bulkConfirm,
    openBulk: (kind: BulkKind) => {
      bulkAction.reset()
      selection.setFailure(null)
      setBulkConfirm({ kind, items: selected, open: true })
    },
    cancelBulk: () => {
      if (!bulkAction.isPending)
        setBulkConfirm((prev) => ({ ...prev, open: false }))
    },
    runBulk: (exclusionScope: ExclusionScope) => {
      const { kind, items } = bulkConfirm
      const job: BulkJob =
        kind === 'exclude'
          ? { kind, scope: exclusionScope, items }
          : { kind, items }
      bulkAction.mutate(job, {
        // per-call callbacks keep the selection scope from when the run started
        onSuccess: ({ failedKeys, failure }) =>
          selection.settle(failedKeys, failure),
        onError: (error) =>
          selection.setFailure({
            message: mutationErrorMessage(
              error,
              kind === 'exclude'
                ? EXCLUDE_ERROR_FALLBACK
                : REMOVE_ERROR_FALLBACK,
            ),
            detail: null,
          }),
        onSettled: () => setBulkConfirm((prev) => ({ ...prev, open: false })),
      })
    },
    bulkPending: bulkAction.isPending,
  }
}

export type ExclusionsPage = ReturnType<typeof useExclusionsPage>
