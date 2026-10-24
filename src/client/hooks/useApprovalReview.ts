import {
  canTransitionApproval,
  isApprovalEditable,
} from '@root/schemas/approval/approval.schema'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useMinLoadingMutation, withMinDuration } from '@/hooks/useMinLoading'
import {
  approveBlockedReason,
  canApprove,
  proposedRouting,
  type ReviewStage,
  withoutAdditionalRouting,
  withRouting,
} from '@/lib/approval'
import {
  approvalRequestKeys,
  approvalRequestsKeys,
  approvalStatsKeys,
} from '@/lib/query-keys'
import { queryClient } from '@/lib/queryClient'
import { apiFetch, mutationErrorMessage } from '@/lib/tanstackApi'
import type { components } from '@/types/api.js'

type ApprovalRequest = components['schemas']['ApprovalRequest']
type ApprovalRouting = components['schemas']['ApprovalRouting']
type ApprovalUpdate = components['schemas']['ApprovalRequestUpdatePayload']

async function approveRequest(id: number, notes: string | undefined) {
  const { data, error } = await apiFetch.POST(
    '/v1/approval/requests/{id}/approve',
    { params: { path: { id } }, body: { notes } },
  )
  if (error) throw error
  return data
}

async function rejectRequest(id: number, reason: string | undefined) {
  const { data, error } = await apiFetch.POST(
    '/v1/approval/requests/{id}/reject',
    { params: { path: { id } }, body: { reason } },
  )
  if (error) throw error
  return data
}

async function deleteRequest(id: number) {
  const { data, error } = await apiFetch.DELETE('/v1/approval/requests/{id}', {
    params: { path: { id } },
  })
  if (error) throw error
  return data
}

async function updateRequest(id: number, body: ApprovalUpdate) {
  const { data, error } = await apiFetch.PATCH('/v1/approval/requests/{id}', {
    params: { path: { id } },
    body,
  })
  if (error) throw error
  return data
}

export type ApprovalReview = ReturnType<typeof useApprovalReview>

interface ApprovalReviewOptions {
  onDecided?: () => void
  /** Must be referentially stable, such as a state setter. */
  onDirtyChange?: (dirty: boolean) => void
}

const ignoreDirty = () => undefined

export function useApprovalReview(
  approval: ApprovalRequest,
  options: ApprovalReviewOptions = {},
) {
  const id = approval.id
  const [stage, setStage] = useState<ReviewStage>('review')
  const [notes, setNotes] = useState('')
  const [reason, setReason] = useState('')

  const onDecided = () => {
    options.onDecided?.()
    return Promise.all([
      queryClient.invalidateQueries({
        queryKey: approvalRequestKeys.byId(id),
      }),
      queryClient.invalidateQueries({ queryKey: approvalRequestsKeys.all }),
    ])
  }
  const approveMutation = useMinLoadingMutation(
    useMutation({
      mutationFn: (approvalNotes: string | undefined) =>
        withMinDuration(approveRequest(id, approvalNotes)),
      onSuccess: onDecided,
    }),
  )
  const rejectMutation = useMinLoadingMutation(
    useMutation({
      mutationFn: (rejectReason: string | undefined) =>
        withMinDuration(rejectRequest(id, rejectReason)),
      onSuccess: onDecided,
    }),
  )
  const deleteMutation = useMinLoadingMutation(
    useMutation({
      mutationFn: () => withMinDuration(deleteRequest(id)),
      onSuccess: () => {
        options.onDecided?.()
        queryClient.removeQueries({ queryKey: approvalRequestKeys.byId(id) })
        return Promise.all([
          queryClient.invalidateQueries({ queryKey: approvalRequestsKeys.all }),
          queryClient.invalidateQueries({ queryKey: approvalStatsKeys.all }),
        ])
      },
    }),
  )
  const saveMutation = useMinLoadingMutation(
    useMutation({
      mutationFn: (update: ApprovalUpdate) =>
        withMinDuration(updateRequest(id, update)),
      onSuccess: (data) => {
        queryClient.setQueryData(approvalRequestKeys.byId(id), data)
        setStage('review')
        return queryClient.invalidateQueries({
          queryKey: approvalRequestsKeys.all,
        })
      },
    }),
  )

  const resetErrors = () => {
    approveMutation.reset()
    rejectMutation.reset()
    deleteMutation.reset()
    saveMutation.reset()
  }
  const changeStage = (next: ReviewStage) => {
    resetErrors()
    setStage(next)
  }

  const busy = approveMutation.isPending
    ? 'approve'
    : rejectMutation.isPending
      ? 'deny'
      : deleteMutation.isPending
        ? 'delete'
        : saveMutation.isPending
          ? 'save'
          : null
  const routing = proposedRouting(approval.proposedRouterDecision)
  const errorMessage =
    busy !== null
      ? null
      : approveMutation.error
        ? mutationErrorMessage(
            approveMutation.error,
            'Approval failed. Try again.',
          )
        : rejectMutation.error
          ? mutationErrorMessage(
              rejectMutation.error,
              'Denial failed. Try again.',
            )
          : deleteMutation.error
            ? mutationErrorMessage(
                deleteMutation.error,
                'The request was not deleted. Try again.',
              )
            : saveMutation.error
              ? mutationErrorMessage(
                  saveMutation.error,
                  'Routing could not be saved. Try again.',
                )
              : null

  return {
    stage,
    notes,
    setNotes,
    reason,
    setReason,
    busy,
    editable: isApprovalEditable(approval.status),
    canDeny: canTransitionApproval(approval.status, 'rejected'),
    approvable: canTransitionApproval(approval.status, 'approved'),
    canApprove:
      canTransitionApproval(approval.status, 'approved') &&
      canApprove({ stage, routing, busy: busy !== null }),
    approveBlockedReason: approveBlockedReason({ stage, routing }),
    errorMessage,
    routingSaved: saveMutation.isSuccess && busy !== 'save',
    reportRoutingDirty: options.onDirtyChange ?? ignoreDirty,
    startEdit: () => changeStage('edit'),
    cancelEdit: () => changeStage('review'),
    startDeny: () => changeStage('deny'),
    cancelDeny: () => {
      setReason('')
      changeStage('review')
    },
    startDelete: () => changeStage('delete'),
    cancelDelete: () => changeStage('review'),
    deleteRequest: () => {
      resetErrors()
      deleteMutation.mutate()
    },
    approve: () => {
      resetErrors()
      approveMutation.mutate(notes.trim() || undefined)
    },
    deny: () => {
      resetErrors()
      rejectMutation.mutate(reason.trim() || undefined)
    },
    removeAdditionalRouting: (index: number) => {
      resetErrors()
      saveMutation.mutate({
        proposedRouterDecision: withoutAdditionalRouting(approval, index),
      })
    },
    saveRouting: (next: ApprovalRouting) => {
      resetErrors()
      saveMutation.mutate({
        proposedRouterDecision: withRouting(approval, next),
      })
    },
  }
}
