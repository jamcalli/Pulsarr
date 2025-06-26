import { useState } from 'react'
import { Loader2, Check } from 'lucide-react'
import {
  Credenza,
  CredenzaContent,
  CredenzaHeader,
  CredenzaTitle,
  CredenzaDescription,
  CredenzaBody,
  CredenzaFooter,
  CredenzaClose,
} from '@/components/ui/credenza'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { useApprovalsStore } from '@/features/plex/store/approvalsStore'
import type { ApprovalRequestResponse } from '@root/schemas/approval/approval.schema'

interface ApprovalActionDialogsProps {
  selectedRequest: ApprovalRequestResponse | null
  approveDialogOpen: boolean
  rejectDialogOpen: boolean
  deleteDialogOpen: boolean
  onApproveDialogClose: () => void
  onRejectDialogClose: () => void
  onDeleteDialogClose: () => void
  onActionComplete: () => Promise<void>
}

/**
 * Displays modal dialogs for approving, rejecting, or deleting an approval request, managing user input and asynchronous action states for each operation.
 *
 * Shows the appropriate dialog based on open state props, allowing users to provide optional notes or reasons, and provides consistent feedback for loading, success, and error conditions. Invokes the supplied callbacks when dialogs are closed or actions complete.
 *
 * @returns The rendered approval action dialogs as React elements.
 */
export function ApprovalActionDialogs({
  selectedRequest,
  approveDialogOpen,
  rejectDialogOpen,
  deleteDialogOpen,
  onApproveDialogClose,
  onRejectDialogClose,
  onDeleteDialogClose,
  onActionComplete,
}: ApprovalActionDialogsProps) {
  const [approveNotes, setApproveNotes] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [approveStatus, setApproveStatus] = useState<
    'idle' | 'loading' | 'success'
  >('idle')
  const [rejectStatus, setRejectStatus] = useState<
    'idle' | 'loading' | 'success'
  >('idle')
  const [deleteStatus, setDeleteStatus] = useState<
    'idle' | 'loading' | 'success'
  >('idle')
  const { approveRequest, rejectRequest, deleteApprovalRequest } =
    useApprovalsStore()

  // Helper function to manage minimum loading duration
  const withMinLoadingDuration = async (
    action: () => Promise<void>,
    setStatus: (status: 'idle' | 'loading' | 'success') => void,
  ) => {
    setStatus('loading')
    const startTime = Date.now()

    try {
      await action()
      setStatus('success')

      // Ensure minimum 500ms loading duration
      const elapsed = Date.now() - startTime
      const remainingTime = Math.max(500 - elapsed, 0)

      setTimeout(() => {
        setStatus('idle')
      }, remainingTime + 1000) // Show success for 1 second after minimum duration
    } catch (error) {
      // Ensure minimum duration even on error
      const elapsed = Date.now() - startTime
      const remainingTime = Math.max(500 - elapsed, 0)

      setTimeout(() => {
        setStatus('idle')
      }, remainingTime)
      throw error
    }
  }

  const handleApprove = async () => {
    if (!selectedRequest) return

    try {
      await withMinLoadingDuration(async () => {
        await approveRequest(
          selectedRequest.id,
          approveNotes.trim() || undefined,
        )
        await onActionComplete()
      }, setApproveStatus)

      setApproveNotes('')
      onApproveDialogClose()
    } catch (error) {
      toast.error('Failed to approve request')
    }
  }

  const handleReject = async () => {
    if (!selectedRequest) return

    try {
      await withMinLoadingDuration(async () => {
        await rejectRequest(
          selectedRequest.id,
          rejectReason.trim() || undefined,
        )
        await onActionComplete()
      }, setRejectStatus)

      setRejectReason('')
      onRejectDialogClose()
    } catch (error) {
      toast.error('Failed to reject request')
    }
  }

  const handleDelete = async () => {
    if (!selectedRequest) return

    try {
      await withMinLoadingDuration(async () => {
        await deleteApprovalRequest(selectedRequest.id)
        await onActionComplete()
      }, setDeleteStatus)

      onDeleteDialogClose()
    } catch (error) {
      toast.error('Failed to delete approval request')
    }
  }

  return (
    <>
      {/* Approve Dialog */}
      <Credenza
        open={approveDialogOpen}
        onOpenChange={(open) => {
          if (approveStatus === 'loading') return
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
            <div className="grid gap-4 mb-6">
              <div className="grid gap-2">
                <Label
                  htmlFor="approve-notes"
                  className="text-foreground text-sm italic"
                >
                  Notes (optional)
                </Label>
                <Textarea
                  id="approve-notes"
                  placeholder="Add any approval notes..."
                  value={approveNotes}
                  onChange={(e) => setApproveNotes(e.target.value)}
                  rows={3}
                  disabled={approveStatus !== 'idle'}
                />
              </div>
            </div>
            <CredenzaFooter>
              <CredenzaClose asChild>
                <Button variant="neutral" disabled={approveStatus !== 'idle'}>
                  Cancel
                </Button>
              </CredenzaClose>
              <Button
                onClick={() => {
                  handleApprove()
                }}
                disabled={approveStatus !== 'idle'}
                className="min-w-[100px] flex items-center justify-center gap-2"
              >
                {approveStatus === 'loading' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Approving...
                  </>
                ) : approveStatus === 'success' ? (
                  <>
                    <Check className="h-4 w-4" />
                    Approved
                  </>
                ) : (
                  'Approve'
                )}
              </Button>
            </CredenzaFooter>
          </CredenzaBody>
        </CredenzaContent>
      </Credenza>

      {/* Reject Dialog */}
      <Credenza
        open={rejectDialogOpen}
        onOpenChange={(open) => {
          if (rejectStatus === 'loading') return
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
            <div className="grid gap-4 mb-6">
              <div className="grid gap-2">
                <Label
                  htmlFor="reject-reason"
                  className="text-foreground text-sm italic"
                >
                  Reason (optional)
                </Label>
                <Textarea
                  id="reject-reason"
                  placeholder="Reason for rejection..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  disabled={rejectStatus !== 'idle'}
                />
              </div>
            </div>
            <CredenzaFooter>
              <CredenzaClose asChild>
                <Button variant="neutral" disabled={rejectStatus !== 'idle'}>
                  Cancel
                </Button>
              </CredenzaClose>
              <Button
                variant="clear"
                onClick={() => {
                  handleReject()
                }}
                disabled={rejectStatus !== 'idle'}
                className="min-w-[100px] flex items-center justify-center gap-2"
              >
                {rejectStatus === 'loading' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Rejecting...
                  </>
                ) : rejectStatus === 'success' ? (
                  <>
                    <Check className="h-4 w-4" />
                    Rejected
                  </>
                ) : (
                  'Reject'
                )}
              </Button>
            </CredenzaFooter>
          </CredenzaBody>
        </CredenzaContent>
      </Credenza>

      {/* Delete Dialog */}
      <Credenza
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (deleteStatus === 'loading') return
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
          <CredenzaBody>
            <CredenzaFooter>
              <CredenzaClose asChild>
                <Button variant="neutral" disabled={deleteStatus !== 'idle'}>
                  Cancel
                </Button>
              </CredenzaClose>
              <Button
                variant="clear"
                onClick={() => {
                  handleDelete()
                }}
                disabled={deleteStatus !== 'idle'}
                className="min-w-[100px] flex items-center justify-center gap-2"
              >
                {deleteStatus === 'loading' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : deleteStatus === 'success' ? (
                  <>
                    <Check className="h-4 w-4" />
                    Deleted
                  </>
                ) : (
                  'Delete'
                )}
              </Button>
            </CredenzaFooter>
          </CredenzaBody>
        </CredenzaContent>
      </Credenza>
    </>
  )
}
