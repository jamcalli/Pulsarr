import {
  AlertCircle,
  Check,
  CheckCircle,
  Loader2,
  Trash2,
  XCircle,
} from 'lucide-react'
import type React from 'react'
import { useId } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'

type ActionType = 'approve' | 'reject' | 'delete' | null

/** Minimal mutation state needed for displaying loading/success states */
interface MutationState {
  isPending: boolean
  isSuccess: boolean
}

interface ApprovalActionFormProps {
  action: ActionType
  notes: string
  setNotes: (notes: string) => void
  submitSectionRef: React.RefObject<HTMLDivElement | null>
  approveRequest: MutationState
  rejectRequest: MutationState
  deleteApproval: MutationState
  handleApprove: () => void
  handleReject: () => void
  handleDelete: () => void
  handleActionSelection: (action: 'approve' | 'reject' | 'delete') => void
  handleCancelAction: () => void
  canApprove: boolean
  canReject: boolean
  canDelete: boolean
  isAnyActionInProgress: boolean
}

/**
 * Displays the action selection buttons and confirmation form for approving,
 * rejecting, or deleting an approval request.
 */
export function ApprovalActionForm({
  action,
  notes,
  setNotes,
  submitSectionRef,
  approveRequest,
  rejectRequest,
  deleteApproval,
  handleApprove,
  handleReject,
  handleDelete,
  handleActionSelection,
  handleCancelAction,
  canApprove,
  canReject,
  canDelete,
  isAnyActionInProgress,
}: ApprovalActionFormProps) {
  const actionNotesId = useId()

  // Compute disabled state once for both submit and cancel buttons
  const isSubmitDisabled =
    (action === 'approve' &&
      (approveRequest.isPending || approveRequest.isSuccess)) ||
    (action === 'reject' &&
      (rejectRequest.isPending || rejectRequest.isSuccess)) ||
    (action === 'delete' &&
      (deleteApproval.isPending || deleteApproval.isSuccess))

  return (
    <div>
      <h3 className="text-lg font-semibold text-foreground mb-4">
        Take Action
      </h3>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          {canApprove && (
            <Button
              variant={action === 'approve' ? 'default' : undefined}
              onClick={() => handleActionSelection('approve')}
              disabled={isAnyActionInProgress || action === 'approve'}
              className="min-w-[100px] flex items-center justify-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              Approve Request
            </Button>
          )}
          {canReject && (
            <Button
              variant="clear"
              onClick={() => handleActionSelection('reject')}
              disabled={isAnyActionInProgress || action === 'reject'}
              className="min-w-[100px] flex items-center justify-center gap-2"
            >
              <XCircle className="w-4 h-4" />
              Reject Request
            </Button>
          )}
          {canDelete && (
            <Button
              variant="clear"
              onClick={() => handleActionSelection('delete')}
              disabled={isAnyActionInProgress || action === 'delete'}
              className="min-w-[100px] flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Delete Request
            </Button>
          )}
        </div>

        {action && (
          <>
            <Separator />
            <div ref={submitSectionRef}>
              {action === 'delete' ? (
                <Alert variant="error">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Confirm Deletion</AlertTitle>
                  <AlertDescription>
                    Are you sure you want to permanently delete this approval
                    request? This action cannot be undone.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor={actionNotesId} className="text-foreground">
                    {action === 'approve'
                      ? 'Approval Notes'
                      : 'Rejection Reason'}{' '}
                    (Optional)
                  </Label>
                  <Textarea
                    id={actionNotesId}
                    placeholder={
                      action === 'approve'
                        ? 'Add any notes about this approval...'
                        : 'Explain why this request is being rejected...'
                    }
                    value={notes}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                      setNotes(e.target.value)
                    }
                    rows={3}
                    disabled={isAnyActionInProgress}
                  />
                </div>
              )}

              <div className="pt-4 flex flex-col sm:flex-row gap-2 justify-between">
                <Button
                  onClick={() => {
                    if (action === 'approve') handleApprove()
                    else if (action === 'reject') handleReject()
                    else if (action === 'delete') handleDelete()
                  }}
                  disabled={isSubmitDisabled}
                  variant={action === 'approve' ? 'default' : 'clear'}
                  className="min-w-[100px] flex items-center justify-center gap-2"
                >
                  {action === 'approve' && approveRequest.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Approving...
                    </>
                  ) : action === 'approve' && approveRequest.isSuccess ? (
                    <>
                      <Check className="h-4 w-4" />
                      Approved
                    </>
                  ) : action === 'reject' && rejectRequest.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Rejecting...
                    </>
                  ) : action === 'reject' && rejectRequest.isSuccess ? (
                    <>
                      <Check className="h-4 w-4" />
                      Rejected
                    </>
                  ) : action === 'delete' && deleteApproval.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Deleting...
                    </>
                  ) : action === 'delete' && deleteApproval.isSuccess ? (
                    <>
                      <Check className="h-4 w-4" />
                      Deleted
                    </>
                  ) : action === 'approve' ? (
                    'Approve & Execute'
                  ) : action === 'reject' ? (
                    'Reject Request'
                  ) : (
                    'Delete Request'
                  )}
                </Button>
                <Button
                  onClick={handleCancelAction}
                  disabled={isSubmitDisabled}
                  variant="neutral"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
