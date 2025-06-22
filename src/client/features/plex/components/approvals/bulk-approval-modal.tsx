import {
  Loader2,
  Check,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  Trash2,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useToast } from '@/hooks/use-toast'
import { useMediaQuery } from '@/hooks/use-media-query'
import type { ApprovalRequestResponse } from '@root/schemas/approval/approval.schema'

type BulkActionType = 'approve' | 'reject' | 'delete'
type BulkActionStatus = 'idle' | 'loading' | 'success' | 'error'

interface BulkApprovalModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedRequests: ApprovalRequestResponse[]
  onBulkApprove?: (requestIds: string[]) => Promise<void>
  onBulkReject?: (requestIds: string[]) => Promise<void>
  onBulkDelete?: (requestIds: string[]) => Promise<void>
  actionStatus: BulkActionStatus
  currentAction?: BulkActionType | null
}

interface FormContentProps {
  selectedRequests: ApprovalRequestResponse[]
  onApprove: () => Promise<void>
  onReject: () => Promise<void>
  onDelete: () => Promise<void>
  onCancel: () => void
  actionStatus: BulkActionStatus
  currentAction?: BulkActionType | null
  canApprove: boolean
  canReject: boolean
}

const FormContent = ({
  selectedRequests,
  onApprove,
  onReject,
  onDelete,
  onCancel,
  actionStatus,
  currentAction,
  canApprove,
  canReject,
}: FormContentProps) => {
  const pendingCount = selectedRequests.filter(
    (req) => req.status === 'pending',
  ).length
  const approvedCount = selectedRequests.filter(
    (req) => req.status === 'approved',
  ).length
  const rejectedCount = selectedRequests.filter(
    (req) => req.status === 'rejected',
  ).length

  return (
    <div className="space-y-4">
      <Alert variant="error" className="break-words">
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
        <AlertTitle>Warning</AlertTitle>
        <AlertDescription className="text-sm">
          You are about to perform bulk actions on {selectedRequests.length}{' '}
          approval requests. This action cannot be undone.
        </AlertDescription>
      </Alert>

      {/* Status breakdown */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-text">
          Selected requests breakdown:
        </h4>
        <div className="flex flex-wrap gap-2">
          {pendingCount > 0 && (
            <Badge
              variant="neutral"
              className="bg-yellow-500 hover:bg-yellow-500 text-black"
            >
              <Clock className="w-3 h-3 mr-1" />
              {pendingCount} Pending
            </Badge>
          )}
          {approvedCount > 0 && (
            <Badge
              variant="default"
              className="bg-green-500 hover:bg-green-500 text-black"
            >
              <CheckCircle className="w-3 h-3 mr-1" />
              {approvedCount} Approved
            </Badge>
          )}
          {rejectedCount > 0 && (
            <Badge
              variant="warn"
              className="bg-red-500 hover:bg-red-500 text-black"
            >
              <XCircle className="w-3 h-3 mr-1" />
              {rejectedCount} Rejected
            </Badge>
          )}
        </div>
      </div>

      {/* Action restrictions */}
      {!canApprove && approvedCount > 0 && (
        <Alert variant="default" className="break-words">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <AlertDescription className="text-sm">
            Cannot approve requests that are already approved.
          </AlertDescription>
        </Alert>
      )}

      {!canReject && (approvedCount > 0 || rejectedCount > 0) && (
        <Alert variant="default" className="break-words">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <AlertDescription className="text-sm">
            Cannot reject approved requests. Only pending and rejected requests
            can be processed.
          </AlertDescription>
        </Alert>
      )}

      {/* Action buttons */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-2">
          {canApprove && (
            <Button
              onClick={onApprove}
              disabled={actionStatus !== 'idle'}
              className="min-w-[100px] flex items-center justify-center gap-2"
            >
              {actionStatus === 'loading' && currentAction === 'approve' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Approving...
                </>
              ) : actionStatus === 'success' && currentAction === 'approve' ? (
                <>
                  <Check className="h-4 w-4" />
                  Approved
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4" />
                  Bulk Approve ({pendingCount + rejectedCount})
                </>
              )}
            </Button>
          )}

          {canReject && (
            <Button
              onClick={onReject}
              disabled={actionStatus !== 'idle'}
              variant="clear"
              className="min-w-[100px] flex items-center justify-center gap-2"
            >
              {actionStatus === 'loading' && currentAction === 'reject' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Rejecting...
                </>
              ) : actionStatus === 'success' && currentAction === 'reject' ? (
                <>
                  <Check className="h-4 w-4" />
                  Rejected
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4" />
                  Bulk Reject ({pendingCount})
                </>
              )}
            </Button>
          )}

          <Button
            onClick={onDelete}
            disabled={actionStatus !== 'idle'}
            variant="clear"
            className="min-w-[100px] flex items-center justify-center gap-2"
          >
            {actionStatus === 'loading' && currentAction === 'delete' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : actionStatus === 'success' && currentAction === 'delete' ? (
              <>
                <Check className="h-4 w-4" />
                Deleted
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                Bulk Delete ({selectedRequests.length})
              </>
            )}
          </Button>
        </div>

        <div className="flex justify-end">
          <Button
            onClick={onCancel}
            disabled={actionStatus !== 'idle'}
            variant="neutral"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function BulkApprovalModal({
  open,
  onOpenChange,
  selectedRequests,
  onBulkApprove,
  onBulkReject,
  onBulkDelete,
  actionStatus,
  currentAction,
}: BulkApprovalModalProps) {
  const { toast } = useToast()
  const isMobile = useMediaQuery('(max-width: 768px)')

  // Determine which actions are available based on selected request statuses
  const hasApproved = selectedRequests.some((req) => req.status === 'approved')
  const hasRejected = selectedRequests.some((req) => req.status === 'rejected')
  const hasPending = selectedRequests.some((req) => req.status === 'pending')

  // Can approve: pending requests or rejected requests (rejected -> approved is allowed)
  const canApprove = (hasPending || hasRejected) && !hasApproved

  // Can reject: only pending requests (cannot go approved -> rejected)
  const canReject = hasPending && !hasApproved

  const handleBulkAction = async (
    action: BulkActionType,
    actionFn?: (requestIds: string[]) => Promise<void>,
  ) => {
    if (!actionFn || selectedRequests.length === 0) return

    const requestIds = selectedRequests.map((req) => String(req.id))

    try {
      await actionFn(requestIds)
    } catch (error) {
      console.error(`Error in bulk ${action}:`, error)
      toast({
        title: 'Error',
        description: `Failed to ${action} approval requests`,
        variant: 'destructive',
      })
    }
  }

  const handleApprove = () => handleBulkAction('approve', onBulkApprove)
  const handleReject = () => handleBulkAction('reject', onBulkReject)
  const handleDelete = () => handleBulkAction('delete', onBulkDelete)

  const handleOpenChange = (newOpen: boolean) => {
    if (actionStatus === 'loading') {
      return
    }
    onOpenChange(newOpen)
  }

  // Conditionally render Dialog or Sheet based on screen size
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          onPointerDownOutside={(e) => {
            if (actionStatus === 'loading') {
              e.preventDefault()
            }
          }}
          onEscapeKeyDown={(e) => {
            if (actionStatus === 'loading') {
              e.preventDefault()
            }
          }}
          className="overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle className="text-text">Bulk Approval Actions</SheetTitle>
            <SheetDescription>
              Perform actions on {selectedRequests.length} selected approval
              requests
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <FormContent
              selectedRequests={selectedRequests}
              onApprove={handleApprove}
              onReject={handleReject}
              onDelete={handleDelete}
              onCancel={() => handleOpenChange(false)}
              actionStatus={actionStatus}
              currentAction={currentAction}
              canApprove={canApprove}
              canReject={canReject}
            />
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  // Desktop view
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-xl max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => {
          if (actionStatus === 'loading') {
            e.preventDefault()
          }
        }}
        onEscapeKeyDown={(e) => {
          if (actionStatus === 'loading') {
            e.preventDefault()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-text">Bulk Approval Actions</DialogTitle>
          <DialogDescription>
            Perform actions on {selectedRequests.length} selected approval
            requests
          </DialogDescription>
        </DialogHeader>
        <FormContent
          selectedRequests={selectedRequests}
          onApprove={handleApprove}
          onReject={handleReject}
          onDelete={handleDelete}
          onCancel={() => handleOpenChange(false)}
          actionStatus={actionStatus}
          currentAction={currentAction}
          canApprove={canApprove}
          canReject={canReject}
        />
      </DialogContent>
    </Dialog>
  )
}
