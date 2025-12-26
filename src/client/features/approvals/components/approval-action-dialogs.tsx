import type { ApprovalRequestResponse } from '@root/schemas/approval/approval.schema'
import { Check, Loader2 } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Credenza,
  CredenzaBody,
  CredenzaClose,
  CredenzaContent,
  CredenzaDescription,
  CredenzaFooter,
  CredenzaHeader,
  CredenzaTitle,
} from '@/components/ui/credenza'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  useApproveRequest,
  useDeleteApproval,
  useRejectRequest,
} from '@/features/approvals/hooks/useApprovalMutations'

interface ApprovalActionDialogsProps {
  selectedRequest: ApprovalRequestResponse | null
  approveDialogOpen: boolean
  rejectDialogOpen: boolean
  deleteDialogOpen: boolean
  onApproveDialogClose: () => void
  onRejectDialogClose: () => void
  onDeleteDialogClose: () => void
}

/**
 * Renders modal dialogs for approving, rejecting, or deleting an approval request.
 *
 * Uses React Query mutation hooks for actions with automatic cache invalidation.
 */
export function ApprovalActionDialogs({
  selectedRequest,
  approveDialogOpen,
  rejectDialogOpen,
  deleteDialogOpen,
  onApproveDialogClose,
  onRejectDialogClose,
  onDeleteDialogClose,
}: ApprovalActionDialogsProps) {
  const [approveNotes, setApproveNotes] = useState('')
  const [rejectReason, setRejectReason] = useState('')

  // Mutation hooks
  const approveRequest = useApproveRequest()
  const rejectRequest = useRejectRequest()
  const deleteApproval = useDeleteApproval()

  const approveNotesId = useId()
  const rejectReasonId = useId()

  // Close dialog and reset after success
  useEffect(() => {
    if (approveRequest.isSuccess) {
      const timer = setTimeout(() => {
        setApproveNotes('')
        onApproveDialogClose()
        approveRequest.reset()
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [approveRequest.isSuccess, onApproveDialogClose, approveRequest])

  useEffect(() => {
    if (rejectRequest.isSuccess) {
      const timer = setTimeout(() => {
        setRejectReason('')
        onRejectDialogClose()
        rejectRequest.reset()
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [rejectRequest.isSuccess, onRejectDialogClose, rejectRequest])

  useEffect(() => {
    if (deleteApproval.isSuccess) {
      const timer = setTimeout(() => {
        onDeleteDialogClose()
        deleteApproval.reset()
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [deleteApproval.isSuccess, onDeleteDialogClose, deleteApproval])

  const handleApprove = async () => {
    if (!selectedRequest) return

    try {
      await approveRequest.mutateAsync({
        id: selectedRequest.id,
        notes: approveNotes.trim() || undefined,
      })
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `Failed to approve request: ${error.message}`
          : 'Failed to approve request. Please try again.',
      )
    }
  }

  const handleReject = async () => {
    if (!selectedRequest) return

    try {
      await rejectRequest.mutateAsync({
        id: selectedRequest.id,
        reason: rejectReason.trim() || undefined,
      })
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `Failed to reject request: ${error.message}`
          : 'Failed to reject request. Please try again.',
      )
    }
  }

  const handleDelete = async () => {
    if (!selectedRequest) return

    try {
      await deleteApproval.mutateAsync(selectedRequest.id)
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `Failed to delete approval request: ${error.message}`
          : 'Failed to delete approval request. Please try again.',
      )
    }
  }

  return (
    <>
      {/* Approve Dialog */}
      <Credenza
        open={approveDialogOpen}
        onOpenChange={(open) => {
          if (approveRequest.isPending || approveRequest.isSuccess) return
          if (!open) onApproveDialogClose()
        }}
      >
        <CredenzaContent>
          <CredenzaHeader>
            <CredenzaTitle className="text-foreground">
              Approve Request
            </CredenzaTitle>
            <CredenzaDescription>
              {selectedRequest && (
                <>
                  Approve "{selectedRequest.contentTitle}" for{' '}
                  {selectedRequest.userName}? This will add the content to the
                  appropriate *arr instance.
                </>
              )}
            </CredenzaDescription>
          </CredenzaHeader>
          <CredenzaBody>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label
                  htmlFor={approveNotesId}
                  className="text-foreground text-sm italic"
                >
                  Notes (optional)
                </Label>
                <Textarea
                  id={approveNotesId}
                  placeholder="Add any approval notes..."
                  value={approveNotes}
                  onChange={(e) => setApproveNotes(e.target.value)}
                  rows={3}
                  disabled={
                    approveRequest.isPending || approveRequest.isSuccess
                  }
                />
              </div>
            </div>
          </CredenzaBody>
          <CredenzaFooter>
            <CredenzaClose asChild>
              <Button
                variant="neutral"
                disabled={approveRequest.isPending || approveRequest.isSuccess}
              >
                Cancel
              </Button>
            </CredenzaClose>
            <Button
              onClick={() => {
                handleApprove()
              }}
              disabled={approveRequest.isPending || approveRequest.isSuccess}
              className="min-w-[100px] flex items-center justify-center gap-2"
            >
              {approveRequest.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Approving...
                </>
              ) : approveRequest.isSuccess ? (
                <>
                  <Check className="h-4 w-4" />
                  Approved
                </>
              ) : (
                'Approve'
              )}
            </Button>
          </CredenzaFooter>
        </CredenzaContent>
      </Credenza>

      {/* Reject Dialog */}
      <Credenza
        open={rejectDialogOpen}
        onOpenChange={(open) => {
          if (rejectRequest.isPending || rejectRequest.isSuccess) return
          if (!open) onRejectDialogClose()
        }}
      >
        <CredenzaContent>
          <CredenzaHeader>
            <CredenzaTitle className="text-foreground">
              Reject Request
            </CredenzaTitle>
            <CredenzaDescription>
              {selectedRequest && (
                <>
                  Reject "{selectedRequest.contentTitle}" for{' '}
                  {selectedRequest.userName}? This will mark the request as
                  rejected without adding the content.
                </>
              )}
            </CredenzaDescription>
          </CredenzaHeader>
          <CredenzaBody>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label
                  htmlFor={rejectReasonId}
                  className="text-foreground text-sm italic"
                >
                  Reason (optional)
                </Label>
                <Textarea
                  id={rejectReasonId}
                  placeholder="Reason for rejection..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  disabled={rejectRequest.isPending || rejectRequest.isSuccess}
                />
              </div>
            </div>
          </CredenzaBody>
          <CredenzaFooter>
            <CredenzaClose asChild>
              <Button
                variant="neutral"
                disabled={rejectRequest.isPending || rejectRequest.isSuccess}
              >
                Cancel
              </Button>
            </CredenzaClose>
            <Button
              variant="clear"
              onClick={() => {
                handleReject()
              }}
              disabled={rejectRequest.isPending || rejectRequest.isSuccess}
              className="min-w-[100px] flex items-center justify-center gap-2"
            >
              {rejectRequest.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Rejecting...
                </>
              ) : rejectRequest.isSuccess ? (
                <>
                  <Check className="h-4 w-4" />
                  Rejected
                </>
              ) : (
                'Reject'
              )}
            </Button>
          </CredenzaFooter>
        </CredenzaContent>
      </Credenza>

      {/* Delete Dialog */}
      <Credenza
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (deleteApproval.isPending || deleteApproval.isSuccess) return
          if (!open) onDeleteDialogClose()
        }}
      >
        <CredenzaContent>
          <CredenzaHeader>
            <CredenzaTitle className="text-foreground">
              Delete Approval Request
            </CredenzaTitle>
            <CredenzaDescription>
              {selectedRequest && (
                <>
                  Are you sure you want to permanently delete the approval
                  request for "{selectedRequest.contentTitle}"? This action
                  cannot be undone.
                </>
              )}
            </CredenzaDescription>
          </CredenzaHeader>
          <CredenzaFooter>
            <CredenzaClose asChild>
              <Button
                variant="neutral"
                disabled={deleteApproval.isPending || deleteApproval.isSuccess}
              >
                Cancel
              </Button>
            </CredenzaClose>
            <Button
              variant="clear"
              onClick={() => {
                handleDelete()
              }}
              disabled={deleteApproval.isPending || deleteApproval.isSuccess}
              className="min-w-[100px] flex items-center justify-center gap-2"
            >
              {deleteApproval.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : deleteApproval.isSuccess ? (
                <>
                  <Check className="h-4 w-4" />
                  Deleted
                </>
              ) : (
                'Delete'
              )}
            </Button>
          </CredenzaFooter>
        </CredenzaContent>
      </Credenza>
    </>
  )
}
