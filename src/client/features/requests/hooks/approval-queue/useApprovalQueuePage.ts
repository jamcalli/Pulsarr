import { canTransitionApproval } from '@root/schemas/approval/approval.schema'
import { useMutation } from '@tanstack/react-query'
import type { RowSelectionState } from '@tanstack/react-table'
import { useEffect, useState } from 'react'
import {
  invalidateApprovalQueue,
  useApprovalQueueList,
} from '@/features/requests/hooks/approval-queue/useApprovalQueueList'
import { useApprovalQueueState } from '@/features/requests/hooks/approval-queue/useApprovalQueueState'
import {
  type BulkAction,
  type BulkFailure,
  bulkErrorFallback,
  bulkFailure,
} from '@/features/requests/lib/approval-queue/bulk-actions'
import {
  hasFilters,
  QUEUE_PAGE_SIZE,
  type QueueState,
  SORTABLE,
  selectionScope,
  withoutFilters,
  withTab,
} from '@/features/requests/lib/approval-queue/queue-state'
import { useMinLoadingMutation, withMinDuration } from '@/hooks/useMinLoading'
import { apiFetch, mutationErrorMessage } from '@/lib/tanstackApi'
import type { components } from '@/types/api.js'

type BulkResult = components['schemas']['ApprovalBulkResult']

interface Selection {
  scope: string
  rows: RowSelectionState
  failure: BulkFailure | null
}

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

function selectedIn(rows: RowSelectionState): boolean {
  return Object.values(rows).some(Boolean)
}

export function useApprovalQueuePage() {
  const { state, setState, pageHref } = useApprovalQueueState()
  const list = useApprovalQueueList(state)
  const scope = selectionScope(state)
  const [selection, setSelection] = useState<Selection>({
    scope,
    rows: {},
    failure: null,
  })
  const current =
    selection.scope === scope ? selection : { scope, rows: {}, failure: null }
  const [confirm, setConfirm] = useState<{
    action: BulkAction
    count: number
    open: boolean
  }>({ action: 'delete', count: 0, open: false })
  const [note, setNote] = useState('')
  const [reviewId, setReviewId] = useState<number | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)

  const rows = list.rows ?? []
  const selected = rows.filter((row) => current.rows[String(row.id)])
  const lastPage = Math.max(1, Math.ceil(list.total / QUEUE_PAGE_SIZE))

  useEffect(() => {
    if (list.rows?.length === 0 && state.page > lastPage) {
      setState({ ...state, page: lastPage })
    }
  }, [list.rows, state, lastPage, setState])

  const bulk = useMinLoadingMutation(
    useMutation({
      mutationFn: (vars: { action: BulkAction; ids: number[]; note: string }) =>
        withMinDuration(runBulk(vars.action, vars.ids, vars.note)),
      onSuccess: (result, { action }) => {
        const failure = bulkFailure(action, result)
        setSelection({
          scope,
          rows: Object.fromEntries(
            result.failed.map((id) => [String(id), true]),
          ),
          failure,
        })
      },
      onError: (error, { action }) => {
        setSelection({
          ...current,
          failure: {
            message: mutationErrorMessage(error, bulkErrorFallback(action)),
            detail: null,
          },
        })
      },
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
    selection: current.rows,
    selected,
    failure: current.failure,
    setSelection: (rows: RowSelectionState) =>
      setSelection({
        scope,
        rows,
        failure: selectedIn(rows) ? current.failure : null,
      }),
    clearSelection: () => setSelection({ scope, rows: {}, failure: null }),
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
      setSelection({ ...current, failure: null })
      setConfirm({ action, count: selected.length, open: true })
    },
    cancelConfirm: () => {
      if (!bulk.isPending) setConfirm((prev) => ({ ...prev, open: false }))
    },
    runConfirmed: () =>
      bulk.mutate({
        action: confirm.action,
        ids: selected.map((row) => row.id),
        note,
      }),
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
