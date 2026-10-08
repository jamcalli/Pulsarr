import { useState } from 'react'
import { useMinLoadingMutation } from '@/hooks/useMinLoading'
import {
  approveBlockedReason,
  canApprove,
  proposedRouting,
  type ReviewStage,
  withoutAdditionalRouting,
  withRouting,
} from '@/lib/approval'
import { approvalRequestKeys, approvalRequestsKeys } from '@/lib/query-keys'
import { queryClient } from '@/lib/queryClient'
import { $api, mutationErrorMessage } from '@/lib/tanstackApi'
import type { components } from '@/types/api.js'

type ApprovalRequest = components['schemas']['ApprovalRequest']
type ApprovalRouting = components['schemas']['ApprovalRouting']

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
    $api.useMutation('post', '/v1/approval/requests/{id}/approve', {
      onSuccess: onDecided,
    }),
  )
  const rejectMutation = useMinLoadingMutation(
    $api.useMutation('post', '/v1/approval/requests/{id}/reject', {
      onSuccess: onDecided,
    }),
  )
  const saveMutation = useMinLoadingMutation(
    $api.useMutation('patch', '/v1/approval/requests/{id}', {
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
    canApprove: canApprove({ stage, routing, busy: busy !== null }),
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
    approve: () => {
      resetErrors()
      approveMutation.mutate({
        params: { path: { id } },
        body: { notes: notes.trim() || undefined },
      })
    },
    deny: () => {
      resetErrors()
      rejectMutation.mutate({
        params: { path: { id } },
        body: { reason: reason.trim() || undefined },
      })
    },
    removeAdditionalRouting: (index: number) => {
      resetErrors()
      saveMutation.mutate({
        params: { path: { id } },
        body: {
          proposedRouterDecision: withoutAdditionalRouting(approval, index),
        },
      })
    },
    saveRouting: (next: ApprovalRouting) => {
      resetErrors()
      saveMutation.mutate({
        params: { path: { id } },
        body: { proposedRouterDecision: withRouting(approval, next) },
      })
    },
  }
}
