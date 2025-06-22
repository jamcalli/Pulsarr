import { useState, useRef } from 'react'
import { format } from 'date-fns'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  CheckCircle,
  XCircle,
  User,
  Calendar,
  Monitor,
  Tv,
  Settings,
  AlertCircle,
  Clock,
  Loader2,
  Check,
  Trash2,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useConfigStore } from '@/stores/configStore'
import { useApprovalsStore } from '@/features/plex/store/approvalsStore'
import { useMediaQuery } from '@/hooks/use-media-query'
import type { ApprovalRequestResponse } from '@root/schemas/approval/approval.schema'

interface ApprovalActionsModalProps {
  request: ApprovalRequestResponse
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdate?: () => Promise<void>
}

/**
 * Sheet/Drawer component for viewing and taking actions on approval requests.
 *
 * Provides detailed view of approval request information and allows users
 * to approve or reject requests with optional notes. Shows comprehensive
 * routing information and request history. Uses Sheet on desktop and Drawer on mobile.
 */
export default function ApprovalActionsModal({
  request,
  open,
  onOpenChange,
  onUpdate,
}: ApprovalActionsModalProps) {
  const [action, setAction] = useState<'approve' | 'reject' | 'delete' | null>(
    null,
  )
  const [notes, setNotes] = useState('')
  const [approveStatus, setApproveStatus] = useState<
    'idle' | 'loading' | 'success'
  >('idle')
  const [rejectStatus, setRejectStatus] = useState<
    'idle' | 'loading' | 'success'
  >('idle')
  const [deleteStatus, setDeleteStatus] = useState<
    'idle' | 'loading' | 'success'
  >('idle')
  const submitSectionRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()
  const { approveRequest, rejectRequest, deleteApprovalRequest } =
    useApprovalsStore()
  const users = useConfigStore((state) => state.users)
  const isMobile = useMediaQuery('(max-width: 768px)')
  const isDesktop = !isMobile

  // TODO: Replace with actual current user ID when multi-admin support is added
  // Currently the system only supports one admin user with ID 1
  const currentAdminId = 1

  const getUserName = (userId: number) => {
    const user = users?.find((u) => u.id === userId)
    return user?.name || `User ${userId}`
  }

  // Helper function to manage minimum loading duration (copied from approval-action-dialogs)
  const withMinLoadingDuration = async (
    actionFn: () => Promise<void>,
    setStatus: (status: 'idle' | 'loading' | 'success') => void,
  ) => {
    setStatus('loading')
    const startTime = Date.now()

    try {
      await actionFn()
      setStatus('success')

      // Don't auto-reset to idle - let the modal close handler do it
      // This prevents button flashing during modal close animation
    } catch (error) {
      // On error, still reset after minimum duration
      const elapsed = Date.now() - startTime
      const remainingTime = Math.max(500 - elapsed, 0)

      setTimeout(() => {
        setStatus('idle')
      }, remainingTime)
      throw error
    }
  }

  const handleApprove = async () => {
    try {
      await withMinLoadingDuration(async () => {
        await approveRequest(
          request.id,
          currentAdminId,
          notes.trim() || undefined,
        )
        if (onUpdate) {
          await onUpdate()
        }
      }, setApproveStatus)

      toast({
        title: 'Success',
        description: 'Approval request approved and processed successfully',
      })

      // Close modal after success state
      setTimeout(() => {
        onOpenChange(false)
        // Reset states after modal close animation completes
        setTimeout(() => {
          setAction(null)
          setNotes('')
          setApproveStatus('idle')
        }, 300)
      }, 1500)
    } catch (error) {
      // Check if it's a conflict error (request already approved/expired)
      const isConflict =
        error instanceof Error &&
        (error.message.includes('already approved') ||
          error.message.includes('already expired') ||
          error.message.includes('Cannot approve request'))

      toast({
        title: 'Error',
        description: isConflict
          ? 'This request has already been processed and cannot be approved again'
          : 'Failed to approve approval request',
        variant: 'destructive',
      })

      // If it's a conflict, close the modal since the request state is invalid
      if (isConflict) {
        setTimeout(() => {
          onOpenChange(false)
          // Reset states after modal close animation completes
          setTimeout(() => {
            setAction(null)
            setNotes('')
          }, 300)
        }, 2000)
      }
    }
  }

  const handleReject = async () => {
    try {
      await withMinLoadingDuration(async () => {
        await rejectRequest(
          request.id,
          currentAdminId,
          notes.trim() || undefined,
        )
        if (onUpdate) {
          await onUpdate()
        }
      }, setRejectStatus)

      toast({
        title: 'Success',
        description: 'Approval request rejected successfully',
      })

      // Close modal after success state
      setTimeout(() => {
        onOpenChange(false)
        // Reset states after modal close animation completes
        setTimeout(() => {
          setAction(null)
          setNotes('')
          setRejectStatus('idle')
        }, 300)
      }, 1500)
    } catch (error) {
      // Check if it's a conflict error (request already processed)
      const isConflict =
        error instanceof Error &&
        (error.message.includes('already') ||
          error.message.includes('Cannot reject request'))

      toast({
        title: 'Error',
        description: isConflict
          ? 'This request has already been processed and cannot be rejected'
          : 'Failed to reject approval request',
        variant: 'destructive',
      })

      // If it's a conflict, close the modal since the request state is invalid
      if (isConflict) {
        setTimeout(() => {
          onOpenChange(false)
          // Reset states after modal close animation completes
          setTimeout(() => {
            setAction(null)
            setNotes('')
          }, 300)
        }, 2000)
      }
    }
  }

  const handleDelete = async () => {
    try {
      await withMinLoadingDuration(async () => {
        await deleteApprovalRequest(request.id)
        if (onUpdate) {
          await onUpdate()
        }
      }, setDeleteStatus)

      toast({
        title: 'Success',
        description: 'Approval request deleted successfully',
      })

      // Close modal after success state
      setTimeout(() => {
        onOpenChange(false)
        // Reset states after modal close animation completes
        setTimeout(() => {
          setAction(null)
          setNotes('')
          setDeleteStatus('idle')
        }, 300)
      }, 1500)
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete approval request',
        variant: 'destructive',
      })
    }
  }

  const isExpired =
    request.expiresAt && new Date(request.expiresAt) < new Date()

  // Follow same logic as table: can approve rejected requests, can't reject approved requests
  const canApprove =
    request.status === 'pending' || request.status === 'rejected'
  const canReject = request.status === 'pending'
  const canDelete = true // Can always delete

  // Check if any action is currently in progress
  const isAnyActionInProgress =
    approveStatus !== 'idle' ||
    rejectStatus !== 'idle' ||
    deleteStatus !== 'idle'

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

  const getStatusBadge = () => {
    switch (request.status) {
      case 'pending':
        return (
          <Badge
            variant="neutral"
            className="bg-yellow-500 hover:bg-yellow-500 text-black"
          >
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        )
      case 'approved':
        return (
          <Badge
            variant="default"
            className="bg-green-500 hover:bg-green-500 text-black"
          >
            <CheckCircle className="w-3 h-3 mr-1" />
            Approved
          </Badge>
        )
      case 'rejected':
        return (
          <Badge
            variant="warn"
            className="bg-red-500 hover:bg-red-500 text-black"
          >
            <XCircle className="w-3 h-3 mr-1" />
            Rejected
          </Badge>
        )
      case 'expired':
        return (
          <Badge
            variant="neutral"
            className="bg-gray-400 hover:bg-gray-400 text-black"
          >
            <AlertCircle className="w-3 h-3 mr-1" />
            Expired
          </Badge>
        )
      default:
        return <Badge variant="neutral">{request.status}</Badge>
    }
  }

  const getTriggerInfo = () => {
    const triggerLabels = {
      quota_exceeded: 'Quota Exceeded',
      router_rule: 'Router Rule',
      manual_flag: 'Manual Flag',
      content_criteria: 'Content Criteria',
    }
    return triggerLabels[request.triggeredBy] || request.triggeredBy
  }

  const getRoutingInfo = () => {
    const routing = request.proposedRouterDecision.approval?.proposedRouting
    if (!routing) return null

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4" />
          <span className="font-medium">
            {routing.instanceType.charAt(0).toUpperCase() +
              routing.instanceType.slice(1)}{' '}
            Instance {routing.instanceId}
          </span>
        </div>
        {routing.qualityProfile && (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Quality Profile: {routing.qualityProfile}
          </div>
        )}
        {routing.rootFolder && (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Root Folder: {routing.rootFolder}
          </div>
        )}
        {routing.tags && routing.tags.length > 0 && (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Tags: {routing.tags.join(', ')}
          </div>
        )}
        {routing.searchOnAdd !== undefined && (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Search on Add: {routing.searchOnAdd ? 'Yes' : 'No'}
          </div>
        )}
        {routing.seasonMonitoring && (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Season Monitoring: {routing.seasonMonitoring}
          </div>
        )}
        {routing.seriesType && (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Series Type: {routing.seriesType}
          </div>
        )}
        {routing.minimumAvailability && (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Minimum Availability: {routing.minimumAvailability}
          </div>
        )}
      </div>
    )
  }

  const renderContent = () => (
    <div className="space-y-6">
      {/* Request Information */}
      <div>
        <h3 className="text-lg font-semibold text-text mb-4">
          Request Information
        </h3>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4" />
              <span className="font-medium">User:</span>
              <span>{getUserName(request.userId)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <span className="font-medium">Created:</span>
              <span>
                {format(new Date(request.createdAt), 'MMM d, yyyy HH:mm')}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium">Content Type:</span>
              <span className="capitalize">{request.contentType}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium">Triggered By:</span>
              <span>{getTriggerInfo()}</span>
            </div>
          </div>

          {request.expiresAt && (
            <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
              <AlertCircle className="w-4 h-4" />
              <span className="font-medium">Expires:</span>
              <span>
                {format(new Date(request.expiresAt), 'MMM d, yyyy HH:mm')}
              </span>
              {isExpired && (
                <Badge variant="warn" className="ml-2">
                  Expired
                </Badge>
              )}
            </div>
          )}

          {request.approvalReason && (
            <div>
              <span className="font-medium">Reason:</span>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {request.approvalReason}
              </p>
            </div>
          )}

          {request.contentGuids.length > 0 && (
            <div>
              <span className="font-medium">Content GUIDs:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {request.contentGuids.map((guid) => (
                  <Badge key={guid} variant="neutral" className="text-xs">
                    {guid}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <Separator />

      {/* Proposed Routing */}
      <div>
        <h3 className="text-lg font-semibold text-text mb-4">
          Proposed Routing
        </h3>
        {getRoutingInfo() || (
          <p className="text-gray-500 dark:text-gray-400">
            No routing information available
          </p>
        )}
      </div>

      {/* Approval History */}
      {(request.status !== 'pending' || request.approvalNotes) && (
        <>
          <Separator />
          <div>
            <h3 className="text-lg font-semibold text-text mb-4">
              Approval History
            </h3>
            <div className="space-y-4">
              {request.status === 'approved' && request.approvedBy && (
                <div className="flex items-start gap-2 text-green-600 dark:text-green-400">
                  <CheckCircle className="w-5 h-5 mt-0.5" />
                  <div>
                    <div className="font-medium">
                      Approved by {getUserName(request.approvedBy)}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {format(new Date(request.updatedAt), 'MMM d, yyyy HH:mm')}
                    </div>
                    {request.approvalNotes && (
                      <div className="text-sm mt-1">
                        {request.approvalNotes}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {request.status === 'rejected' && (
                <div className="flex items-start gap-2 text-red-600 dark:text-red-400">
                  <XCircle className="w-5 h-5 mt-0.5" />
                  <div>
                    <div className="font-medium">Request Rejected</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {format(new Date(request.updatedAt), 'MMM d, yyyy HH:mm')}
                    </div>
                    {request.approvalNotes && (
                      <div className="text-sm mt-1">
                        {request.approvalNotes}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Action Selection */}
      {(canApprove || canReject || canDelete) && !isExpired && (
        <>
          <Separator />
          <div>
            <h3 className="text-lg font-semibold text-text mb-4">
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
                    variant={action === 'reject' ? 'clear' : 'clear'}
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
                    variant={action === 'delete' ? 'clear' : 'clear'}
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
                      <div className="space-y-4">
                        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
                          <div className="flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                            <div>
                              <h4 className="font-medium text-red-800 dark:text-red-200 mb-1">
                                Confirm Deletion
                              </h4>
                              <p className="text-sm text-red-700 dark:text-red-300">
                                Are you sure you want to permanently delete this
                                approval request? This action cannot be undone.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label htmlFor="action-notes">
                          {action === 'approve'
                            ? 'Approval Notes'
                            : 'Rejection Reason'}{' '}
                          (Optional)
                        </Label>
                        <Textarea
                          id="action-notes"
                          placeholder={
                            action === 'approve'
                              ? 'Add any notes about this approval...'
                              : 'Explain why this request is being rejected...'
                          }
                          value={notes}
                          onChange={(
                            e: React.ChangeEvent<HTMLTextAreaElement>,
                          ) => setNotes(e.target.value)}
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
                        disabled={
                          (action === 'approve' && approveStatus !== 'idle') ||
                          (action === 'reject' && rejectStatus !== 'idle') ||
                          (action === 'delete' && deleteStatus !== 'idle')
                        }
                        variant={action === 'approve' ? 'default' : 'clear'}
                        className="min-w-[100px] flex items-center justify-center gap-2"
                      >
                        {action === 'approve' && approveStatus === 'loading' ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Approving...
                          </>
                        ) : action === 'approve' &&
                          approveStatus === 'success' ? (
                          <>
                            <Check className="h-4 w-4" />
                            Approved
                          </>
                        ) : action === 'reject' &&
                          rejectStatus === 'loading' ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Rejecting...
                          </>
                        ) : action === 'reject' &&
                          rejectStatus === 'success' ? (
                          <>
                            <Check className="h-4 w-4" />
                            Rejected
                          </>
                        ) : action === 'delete' &&
                          deleteStatus === 'loading' ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Deleting...
                          </>
                        ) : action === 'delete' &&
                          deleteStatus === 'success' ? (
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
                        disabled={
                          (action === 'approve' && approveStatus !== 'idle') ||
                          (action === 'reject' && rejectStatus !== 'idle') ||
                          (action === 'delete' && deleteStatus !== 'idle')
                        }
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
        </>
      )}
    </div>
  )

  // For desktop - use Sheet
  if (isDesktop) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="!w-[90vw] md:!w-[70vw] lg:!w-[60vw] xl:!w-[50vw] !max-w-[800px] sm:!max-w-[800px] overflow-y-auto flex flex-col p-5"
        >
          <SheetHeader className="mb-6 flex-shrink-0">
            <SheetTitle className="flex items-center gap-2 text-text text-xl">
              {request.contentType === 'movie' ? (
                <Monitor className="w-5 h-5" />
              ) : (
                <Tv className="w-5 h-5" />
              )}
              {request.contentTitle}
              {getStatusBadge()}
            </SheetTitle>
            <SheetDescription>
              Approval request details and actions
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto pb-8 px-1">
            {renderContent()}
          </div>

          {/* Empty spacer div to ensure content doesn't get cut off */}
          <div className="h-2 flex-shrink-0" />
        </SheetContent>
      </Sheet>
    )
  }

  // For mobile - use Drawer
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="h-[90vh] text-text">
        <DrawerHeader className="mb-6 flex-shrink-0">
          <DrawerTitle className="flex items-center gap-2 text-text text-xl">
            {request.contentType === 'movie' ? (
              <Monitor className="w-5 h-5" />
            ) : (
              <Tv className="w-5 h-5" />
            )}
            {request.contentTitle}
            {getStatusBadge()}
          </DrawerTitle>
          <DrawerDescription className="text-text">
            Approval request details and actions
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex-1 overflow-y-auto pb-8 px-5">
          {renderContent()}
        </div>

        {/* Empty spacer div to ensure content doesn't get cut off */}
        <div className="h-2 flex-shrink-0" />
      </DrawerContent>
    </Drawer>
  )
}
