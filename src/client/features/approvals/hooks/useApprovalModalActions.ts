import type { ApprovalRequestResponse } from '@root/schemas/approval/approval.schema'
import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  useApproveRequest,
  useDeleteApproval,
  useRejectRequest,
  useUpdateApproval,
} from './useApprovalMutations'

interface UseApprovalModalActionsOptions {
  request: ApprovalRequestResponse
  onOpenChange: (open: boolean) => void
}

/**
 * Hook that encapsulates all action-related logic for the approval modal.
 *
 * Manages mutation hooks, action state, and handlers for approve/reject/delete/routing operations.
 * Handles success/error states, modal closing behavior, and conflict error detection.
 */
export function useApprovalModalActions({
  request,
  onOpenChange,
}: UseApprovalModalActionsOptions) {
  const [action, setAction] = useState<'approve' | 'reject' | 'delete' | null>(
    null,
  )
  const [notes, setNotes] = useState('')
  const [editRoutingMode, setEditRoutingMode] = useState(false)
  const submitSectionRef = useRef<HTMLDivElement>(null)

  // Mutation hooks
  const approveRequest = useApproveRequest()
  const rejectRequest = useRejectRequest()
  const deleteApproval = useDeleteApproval()
  const updateApproval = useUpdateApproval()

  // Reset mutations when modal closes to clear success states
  const resetMutations = useCallback(() => {
    approveRequest.reset()
    rejectRequest.reset()
    deleteApproval.reset()
    setAction(null)
    setNotes('')
  }, [approveRequest, rejectRequest, deleteApproval])

  const handleApprove = async () => {
    try {
      await approveRequest.mutateAsync({
        id: request.id,
        notes: notes.trim() || undefined,
      })

      // Close modal after success state displays
      setTimeout(() => {
        onOpenChange(false)
        // Reset states after modal close animation completes
        setTimeout(resetMutations, 300)
      }, 1500)
    } catch (error) {
      // Check if it's a conflict error (request already approved/expired)
      const isConflict =
        error instanceof Error &&
        (error.message.includes('already approved') ||
          error.message.includes('already expired') ||
          error.message.includes('Cannot approve request'))

      toast.error(
        isConflict
          ? 'This request has already been processed and cannot be approved again'
          : 'Failed to approve approval request',
      )

      // If it's a conflict, close the modal since the request state is invalid
      if (isConflict) {
        setTimeout(() => {
          onOpenChange(false)
          setTimeout(resetMutations, 300)
        }, 2000)
      }
    }
  }

  const handleReject = async () => {
    try {
      await rejectRequest.mutateAsync({
        id: request.id,
        reason: notes.trim() || undefined,
      })

      // Close modal after success state displays
      setTimeout(() => {
        onOpenChange(false)
        setTimeout(resetMutations, 300)
      }, 1500)
    } catch (error) {
      // Check if it's a conflict error (request already processed)
      const isConflict =
        error instanceof Error &&
        (error.message.includes('already') ||
          error.message.includes('Cannot reject request'))

      toast.error(
        isConflict
          ? 'This request has already been processed and cannot be rejected'
          : 'Failed to reject approval request',
      )

      // If it's a conflict, close the modal since the request state is invalid
      if (isConflict) {
        setTimeout(() => {
          onOpenChange(false)
          setTimeout(resetMutations, 300)
        }, 2000)
      }
    }
  }

  const handleDelete = async () => {
    try {
      await deleteApproval.mutateAsync(request.id)

      // Close modal after success state displays
      setTimeout(() => {
        onOpenChange(false)
        setTimeout(resetMutations, 300)
      }, 1500)
    } catch (_error) {
      toast.error('Failed to delete approval request')
    }
  }

  const handleRoutingSave = async (updatedRouting: {
    instanceId: number
    instanceType: 'radarr' | 'sonarr'
    qualityProfile?: string | number | null
    rootFolder?: string | null
    tags?: string[]
    priority: number
    searchOnAdd?: boolean | null
    seasonMonitoring?: string | null
    seriesType?: 'standard' | 'anime' | 'daily' | null
    minimumAvailability?: 'announced' | 'inCinemas' | 'released'
    syncedInstances?: number[]
  }) => {
    const updatedRequest = {
      ...request,
      proposedRouterDecision: {
        ...request.proposedRouterDecision,
        approval: {
          ...request.proposedRouterDecision.approval,
          proposedRouting: updatedRouting,
        },
      },
    }

    // Update only the routing without changing status
    await updateApproval.mutateAsync({
      id: request.id,
      updates: {
        proposedRouterDecision: {
          ...updatedRequest.proposedRouterDecision,
          approval: {
            ...updatedRequest.proposedRouterDecision.approval,
            data: updatedRequest.proposedRouterDecision.approval?.data || {},
            reason:
              updatedRequest.proposedRouterDecision.approval?.reason || '',
            triggeredBy:
              updatedRequest.proposedRouterDecision.approval?.triggeredBy ||
              request.triggeredBy,
          },
        },
      },
    })

    // Don't exit edit mode here - let the routing card handle the timing
    // The routing card will call onCancel after its success state completes
  }

  const handleActionSelection = (
    selectedAction: 'approve' | 'reject' | 'delete',
  ) => {
    if (action === selectedAction) {
      setAction(null) // Toggle off if same action clicked
      return
    }
    setAction(selectedAction)
    // Auto-scroll to submit section after a brief delay to allow DOM update
    setTimeout(() => {
      submitSectionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }, 100)
  }

  const handleCancelAction = () => {
    setAction(null)
    setNotes('')
  }

  const handleCancelRouting = () => {
    setEditRoutingMode(false)
    updateApproval.reset()
  }

  // Computed values
  const isExpired =
    request.expiresAt && new Date(request.expiresAt) < new Date()

  // Follow same logic as table: can approve rejected requests, can't reject approved requests
  const canApprove =
    request.status === 'pending' || request.status === 'rejected'
  const canReject = request.status === 'pending'
  const canDelete = true // Can always delete

  // Check if any action is currently in progress (using mutation states)
  const isAnyActionInProgress =
    approveRequest.isPending ||
    approveRequest.isSuccess ||
    rejectRequest.isPending ||
    rejectRequest.isSuccess ||
    deleteApproval.isPending ||
    deleteApproval.isSuccess ||
    updateApproval.isPending

  return {
    // State
    action,
    notes,
    setNotes,
    editRoutingMode,
    setEditRoutingMode,
    submitSectionRef,

    // Mutation states
    approveRequest,
    rejectRequest,
    deleteApproval,
    updateApproval,

    // Handlers
    handleApprove,
    handleReject,
    handleDelete,
    handleRoutingSave,
    handleActionSelection,
    handleCancelAction,
    handleCancelRouting,

    // Computed values
    isExpired,
    canApprove,
    canReject,
    canDelete,
    isAnyActionInProgress,
  }
}
