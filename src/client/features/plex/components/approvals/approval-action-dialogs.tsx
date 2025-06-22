import { useState } from 'react'
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
import { CheckCircle, XCircle, Trash2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
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
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()
  const { approveRequest, rejectRequest, deleteApprovalRequest } =
    useApprovalsStore()

  // TODO: Replace with actual current user ID when multi-admin support is added
  // Currently the system only supports one admin user with ID 1
  const currentAdminId = 1

  const handleApprove = async () => {
    if (!selectedRequest) return

    setLoading(true)
    try {
      await approveRequest(
        selectedRequest.id,
        currentAdminId,
        approveNotes.trim() || undefined,
      )
      toast({
        title: 'Success',
        description: 'Approval request approved and processed successfully',
      })
      setApproveNotes('')
      onApproveDialogClose()
      await onActionComplete()
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to approve request',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleReject = async () => {
    if (!selectedRequest) return

    setLoading(true)
    try {
      await rejectRequest(
        selectedRequest.id,
        currentAdminId,
        rejectReason.trim() || undefined,
      )
      toast({
        title: 'Success',
        description: 'Approval request rejected successfully',
      })
      setRejectReason('')
      onRejectDialogClose()
      await onActionComplete()
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to reject request',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedRequest) return

    setLoading(true)
    try {
      await deleteApprovalRequest(selectedRequest.id)
      toast({
        title: 'Success',
        description: 'Approval request deleted successfully',
      })
      onDeleteDialogClose()
      await onActionComplete()
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete approval request',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Approve Dialog */}
      <Credenza open={approveDialogOpen} onOpenChange={onApproveDialogClose}>
        <CredenzaContent>
          <CredenzaHeader>
            <CredenzaTitle className="text-text">Approve Request</CredenzaTitle>
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
                  className="text-text text-sm italic"
                >
                  Notes (optional)
                </Label>
                <Textarea
                  id="approve-notes"
                  placeholder="Add any approval notes..."
                  value={approveNotes}
                  onChange={(e) => setApproveNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <CredenzaFooter>
              <CredenzaClose asChild>
                <Button variant="neutral" disabled={loading}>
                  Cancel
                </Button>
              </CredenzaClose>
              <Button
                variant="clear"
                onClick={() => {
                  handleApprove()
                }}
                disabled={loading}
              >
                {loading ? 'Approving...' : 'Approve'}
              </Button>
            </CredenzaFooter>
          </CredenzaBody>
        </CredenzaContent>
      </Credenza>

      {/* Reject Dialog */}
      <Credenza open={rejectDialogOpen} onOpenChange={onRejectDialogClose}>
        <CredenzaContent>
          <CredenzaHeader>
            <CredenzaTitle className="text-text">Reject Request</CredenzaTitle>
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
                  className="text-text text-sm italic"
                >
                  Reason (optional)
                </Label>
                <Textarea
                  id="reject-reason"
                  placeholder="Reason for rejection..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <CredenzaFooter>
              <CredenzaClose asChild>
                <Button variant="neutral" disabled={loading}>
                  Cancel
                </Button>
              </CredenzaClose>
              <Button
                variant="clear"
                onClick={() => {
                  handleReject()
                }}
                disabled={loading}
              >
                {loading ? 'Rejecting...' : 'Reject'}
              </Button>
            </CredenzaFooter>
          </CredenzaBody>
        </CredenzaContent>
      </Credenza>

      {/* Delete Dialog */}
      <Credenza open={deleteDialogOpen} onOpenChange={onDeleteDialogClose}>
        <CredenzaContent>
          <CredenzaHeader>
            <CredenzaTitle className="text-text">
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
                <Button variant="neutral" disabled={loading}>
                  Cancel
                </Button>
              </CredenzaClose>
              <Button
                variant="clear"
                onClick={() => {
                  handleDelete()
                }}
                disabled={loading}
              >
                {loading ? 'Deleting...' : 'Delete'}
              </Button>
            </CredenzaFooter>
          </CredenzaBody>
        </CredenzaContent>
      </Credenza>
    </>
  )
}
