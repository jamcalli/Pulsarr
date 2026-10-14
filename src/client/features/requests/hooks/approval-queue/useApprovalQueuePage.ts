import { canTransitionApproval } from '@root/schemas/approval/approval.schema'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { PageSize } from '@/components/data-table/page-size'
import {
  invalidateApprovalQueue,
  useApprovalQueueList,
} from '@/features/requests/hooks/approval-queue/useApprovalQueueList'
import {
  type BulkAction,
  bulkErrorFallback,
  bulkFailure,
} from '@/features/requests/lib/approval-queue/bulk-actions'
import {
  hasFilters,
  parseQueueState,
  type QueueState,
  queuePageSizePref,
  SORTABLE,
  selectionScope,
  serializeQueueState,
  withoutFilters,
  withTab,
} from '@/features/requests/lib/approval-queue/queue-state'
import { useMinLoadingMutation, withMinDuration } from '@/hooks/useMinLoading'
import { useScopedSelection } from '@/hooks/useScopedSelection'
import { useUrlState } from '@/hooks/useUrlState'
import { usePref } from '@/lib/prefs'
import { apiFetch, mutationErrorMessage } from '@/lib/tanstackApi'
import type { components } from '@/types/api.js'

type BulkResult = components['schemas']['ApprovalBulkResult']

async function runBulk(
  action: BulkAction,
  requestIds: number[],
  note: string,
): Promise<BulkResult> {
  const text = note.trim() || undefined
  const { data, error } =
    action === 'approve'
      ? await apiFetch.POST('/v1/approval/requests/bulk/approve', {
          body: { requestIds, notes: text },
        })
      : action === 'deny'
        ? await apiFetch.POST('/v1/approval/requests/bulk/reject', {
            body: { requestIds, reason: text },
          })
        : await apiFetch.DELETE('/v1/approval/requests/bulk/delete', {
            body: { requestIds },
          })
  if (error) throw error
  return data.result
}

export function useApprovalQueuePage() {
  const { state, setState, pageHref } = useUrlState(
    parseQueueState,
    serializeQueueState,
  )
  const [pageSize, savePageSize] = usePref(queuePageSizePref)
  const list = useApprovalQueueList(state, pageSize)
  const selection = useScopedSelection(selectionScope(state))
  const [confirm, setConfirm] = useState<{
    action: BulkAction
    count: number
    open: boolean
  }>({ action: 'delete', count: 0, open: false })
  const [note, setNote] = useState('')
  const [reviewId, setReviewId] = useState<number | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)

  const rows = list.rows ?? []
  const selected = rows.filter((row) => selection.rows[String(row.id)])
  const lastPage = Math.max(1, Math.ceil(list.total / pageSize))

  useEffect(() => {
    if (list.rows?.length === 0 && state.page > lastPage) {
      setState({ ...state, page: lastPage })
    }
  }, [list.rows, state, lastPage, setState])

  const bulk = useMinLoadingMutation(
    useMutation({
      mutationFn: (vars: { action: BulkAction; ids: number[]; note: string }) =>
        withMinDuration(runBulk(vars.action, vars.ids, vars.note)),
      onSettled: () => {
        setConfirm((prev) => ({ ...prev, open: false }))
        return invalidateApprovalQueue()
      },
    }),
  )

  return {
    state,
    pageHref,
    rows: list.rows,
    total: list.total,
    stats: list.stats,
    isLoading: list.isLoading,
    stale: list.stale,
    errorMessage: list.errorMessage,
    retry: list.retry,
    filtered: hasFilters(state),
    sortKeys: SORTABLE[state.tab],
    update: (patch: Partial<QueueState>) =>
      setState({ ...state, page: 1, ...patch }),
    selectTab: (tab: QueueState['tab']) => {
      if (tab !== state.tab) setState(withTab(state, tab))
    },
    clearFilters: () => setState(withoutFilters(state)),
    setPage: (page: number) => setState({ ...state, page }),
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
    canApprove:
      selected.length > 0 &&
      selected.every((row) => canTransitionApproval(row.status, 'approved')),
    canDeny:
      selected.length > 0 &&
      selected.every((row) => canTransitionApproval(row.status, 'rejected')),
    confirm,
    note,
    setNote,
    openConfirm: (action: BulkAction) => {
      bulk.reset()
      setNote('')
      selection.setFailure(null)
      setConfirm({ action, count: selected.length, open: true })
    },
    cancelConfirm: () => {
      if (!bulk.isPending) setConfirm((prev) => ({ ...prev, open: false }))
    },
    runConfirmed: () =>
      bulk.mutate(
        {
          action: confirm.action,
          ids: selected.map((row) => row.id),
          note,
        },
        // per-call callbacks keep the selection scope from when the run started
        {
          onSuccess: (result, { action }) => {
            selection.settle(result.failed, bulkFailure(action, result))
          },
          onError: (error, { action }) => {
            selection.setFailure({
              message: mutationErrorMessage(error, bulkErrorFallback(action)),
              detail: null,
            })
          },
        },
      ),
    bulkPending: bulk.isPending,
    reviewId,
    reviewOpen,
    openReview: (id: number) => {
      setReviewId(id)
      setReviewOpen(true)
    },
    setReviewOpen,
  }
}

export type ApprovalQueuePage = ReturnType<typeof useApprovalQueuePage>
