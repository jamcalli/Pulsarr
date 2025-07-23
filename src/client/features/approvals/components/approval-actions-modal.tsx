import { useState, useRef, useEffect, useCallback } from 'react'
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  CheckCircle,
  XCircle,
  User,
  Calendar,
  Monitor,
  Tv,
  AlertCircle,
  Clock,
  Loader2,
  Check,
  Trash2,
  Info,
  ArrowLeftRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { useConfigStore } from '@/stores/configStore'
import { useApprovalsStore } from '@/features/approvals/store/approvalsStore'
import { useMediaQuery } from '@/hooks/use-media-query'
import { ApprovalSonarrRoutingCard } from '@/features/approvals/components/approval-sonarr-routing-card'
import { ApprovalRadarrRoutingCard } from '@/features/approvals/components/approval-radarr-routing-card'
import { TmdbMetadataDisplay } from '@/components/tmdb-metadata-display'
import { useTmdbMetadata } from '@/hooks/useTmdbMetadata'
import type { ApprovalRequestResponse } from '@root/schemas/approval/approval.schema'

interface ApprovalActionsModalProps {
  request: ApprovalRequestResponse
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdate?: () => Promise<void>
}

/**
 * Renders a responsive modal interface for viewing and managing an approval request, including actions to approve, reject, delete, or edit routing details.
 *
 * Displays request metadata, routing configuration, approval history, and action controls. Supports optional notes for actions, manages loading and success states, and can trigger an external update callback after actions. Adapts layout for desktop and mobile devices.
 *
 * @param request - The approval request to display and manage
 * @param open - Whether the modal is visible
 * @param onOpenChange - Callback to control modal visibility
 * @param onUpdate - Optional callback invoked after an action to refresh data
 * @returns The modal UI for approval request actions
 */
export default function ApprovalActionsModal({
  request,
  open,
  onOpenChange,
  onUpdate,
}: ApprovalActionsModalProps) {
  // Simple fade transition instead of 3D flip to preserve scrolling
  const transitionStyles = `
    .content-container {
      position: relative;
      width: 100%;
      height: 100%;
    }
    
    .content-view {
      position: absolute;
      width: 100%;
      height: 100%;
      overflow-y: auto;
      transition: opacity 0.3s ease-in-out;
      opacity: 1;
    }
    
    .content-view.hidden {
      opacity: 0;
      pointer-events: none;
    }
  `
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
  const [editRoutingMode, setEditRoutingMode] = useState(false)
  const [showMediaDetails, setShowMediaDetails] = useState(false)
  const submitSectionRef = useRef<HTMLDivElement>(null)
  const {
    approveRequest,
    rejectRequest,
    deleteApprovalRequest,
    updateApprovalRequest,
  } = useApprovalsStore()
  const users = useConfigStore((state) => state.users)
  const isMobile = useMediaQuery('(max-width: 768px)')
  const isDesktop = !isMobile
  const tmdbMetadata = useTmdbMetadata()

  // Clear TMDB metadata when modal opens with a new request
  // biome-ignore lint/correctness/useExhaustiveDependencies: request.id is intentionally included to reset state when switching between requests
  useEffect(() => {
    tmdbMetadata.clearData()
    setShowMediaDetails(false)
  }, [request.id])

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
        await approveRequest(request.id, notes.trim() || undefined)
        if (onUpdate) {
          await onUpdate()
        }
      }, setApproveStatus)

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

      toast.error(
        isConflict
          ? 'This request has already been processed and cannot be approved again'
          : 'Failed to approve approval request',
      )

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
        await rejectRequest(request.id, notes.trim() || undefined)
        if (onUpdate) {
          await onUpdate()
        }
      }, setRejectStatus)

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

      toast.error(
        isConflict
          ? 'This request has already been processed and cannot be rejected'
          : 'Failed to reject approval request',
      )

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
    await updateApprovalRequest(request.id, {
      proposedRouterDecision: {
        ...updatedRequest.proposedRouterDecision,
        approval: {
          ...updatedRequest.proposedRouterDecision.approval,
          data: updatedRequest.proposedRouterDecision.approval?.data || {},
          reason: updatedRequest.proposedRouterDecision.approval?.reason || '',
          triggeredBy:
            updatedRequest.proposedRouterDecision.approval?.triggeredBy ||
            request.triggeredBy,
        },
      },
    })

    if (onUpdate) {
      await onUpdate()
    }

    // Don't exit edit mode here - let the routing card handle the timing
    // The routing card will call onCancel after its success state completes
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

  const handleShowMediaDetails = async () => {
    if (showMediaDetails) {
      setShowMediaDetails(false)
      return
    }

    // Always fetch fresh metadata for the current request
    await tmdbMetadata.fetchMetadata(request)
    setShowMediaDetails(true)
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

  const renderMediaDetailsContent = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">
          Media Details
        </h3>

        {tmdbMetadata.error ? (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-red-800 dark:text-red-200 mb-1">
                  Unable to Load Media Details
                </h4>
                <p className="text-sm text-red-700 dark:text-red-300">
                  {tmdbMetadata.error}
                </p>
              </div>
            </div>
          </div>
        ) : tmdbMetadata.data ? (
          <TmdbMetadataDisplay
            data={tmdbMetadata.data}
            onRegionChange={() => tmdbMetadata.fetchMetadata(request, true)}
          />
        ) : (
          <div className="flex items-center justify-center h-64">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Loading media details...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  const renderContent = () => (
    <div className="space-y-6">
      {/* Request Information */}
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">
          Request Information
        </h3>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-foreground" />
              <span className="font-medium text-foreground">User:</span>
              <span className="text-foreground">
                {getUserName(request.userId)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-foreground" />
              <span className="font-medium text-foreground">Created:</span>
              <span className="text-foreground">
                {format(new Date(request.createdAt), 'MMM d, yyyy HH:mm')}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground">Content Type:</span>
              <span className="capitalize text-foreground">
                {request.contentType}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground">Triggered By:</span>
              <span className="text-foreground">{getTriggerInfo()}</span>
            </div>
          </div>

          {request.status === 'approved' || request.status === 'rejected' ? (
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-foreground" />
              <span className="font-medium text-foreground">Resolved:</span>
              <span className="text-foreground">
                {format(new Date(request.updatedAt), 'MMM d, yyyy HH:mm')}
              </span>
            </div>
          ) : (
            request.expiresAt && (
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-foreground" />
                <span className="font-medium text-foreground">Expires:</span>
                <span
                  className={`${isExpired ? 'text-red-600' : 'text-orange-600'}`}
                >
                  {format(new Date(request.expiresAt), 'MMM d, yyyy HH:mm')}
                </span>
                {isExpired && (
                  <Badge variant="warn" className="ml-2">
                    Expired
                  </Badge>
                )}
              </div>
            )
          )}

          {request.approvalReason && (
            <div>
              <span className="font-medium text-foreground">Reason:</span>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {request.approvalReason}
              </p>
            </div>
          )}

          {request.contentGuids.length > 0 && (
            <div>
              <span className="font-medium text-foreground">
                Content GUIDs:
              </span>
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
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">
            Proposed Routing
          </h3>
          {!editRoutingMode && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Button
                      onClick={() => setEditRoutingMode(true)}
                      variant="neutral"
                      size="sm"
                      disabled={
                        isAnyActionInProgress ||
                        request.status === 'approved' ||
                        request.status === 'expired'
                      }
                    >
                      Edit Routing
                    </Button>
                  </div>
                </TooltipTrigger>
                {(request.status === 'approved' ||
                  request.status === 'expired') && (
                  <TooltipContent>
                    <p>Cannot edit routing for {request.status} requests</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        <div className="space-y-4">
          {request.proposedRouterDecision?.approval?.proposedRouting ? (
            request.proposedRouterDecision.approval.proposedRouting
              .instanceType === 'sonarr' ? (
              <ApprovalSonarrRoutingCard
                routing={
                  request.proposedRouterDecision.approval.proposedRouting
                }
                instanceId={
                  request.proposedRouterDecision.approval.proposedRouting
                    .instanceId
                }
                onSave={handleRoutingSave}
                onCancel={() => setEditRoutingMode(false)}
                disabled={!editRoutingMode || isAnyActionInProgress}
              />
            ) : (
              <ApprovalRadarrRoutingCard
                routing={
                  request.proposedRouterDecision.approval.proposedRouting
                }
                instanceId={
                  request.proposedRouterDecision.approval.proposedRouting
                    .instanceId
                }
                onSave={handleRoutingSave}
                onCancel={() => setEditRoutingMode(false)}
                disabled={!editRoutingMode || isAnyActionInProgress}
              />
            )
          ) : (
            <p className="text-gray-500 dark:text-gray-400">
              No routing information available
            </p>
          )}
        </div>
      </div>

      {/* Approval History */}
      {(request.status !== 'pending' || request.approvalNotes) && (
        <>
          <Separator />
          <div>
            <h3 className="text-lg font-semibold text-foreground mb-4">
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
                            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
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
                        <Label
                          htmlFor="action-notes"
                          className="text-foreground"
                        >
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
      <>
        <style>{transitionStyles}</style>
        <Sheet open={open} onOpenChange={onOpenChange}>
          <SheetContent
            side="right"
            className="w-[90vw]! md:w-[70vw]! lg:w-[60vw]! xl:w-[50vw]! max-w-[800px]! sm:max-w-[800px]! overflow-y-auto flex flex-col p-5 text-foreground"
          >
            <SheetHeader className="mb-6 shrink-0">
              <div className="flex items-center justify-between">
                <SheetTitle className="flex items-center gap-2 text-foreground text-xl">
                  {request.contentType === 'movie' ? (
                    <Monitor className="w-5 h-5" />
                  ) : (
                    <Tv className="w-5 h-5" />
                  )}
                  {request.contentTitle}
                  {getStatusBadge()}
                </SheetTitle>
                <Button
                  variant="neutralnoShadow"
                  size="sm"
                  onClick={handleShowMediaDetails}
                  disabled={tmdbMetadata.loading}
                  className="flex items-center gap-2"
                >
                  {tmdbMetadata.loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <ArrowLeftRight className="w-4 h-4" />
                      {showMediaDetails
                        ? 'Request Info'
                        : `${request.contentType === 'movie' ? 'Movie' : 'Show'} Info`}
                    </>
                  )}
                </Button>
              </div>
              <SheetDescription>
                {showMediaDetails
                  ? 'TMDB metadata and streaming information'
                  : 'Approval request details and actions'}
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto pb-4 px-1">
              <div className="content-container h-full">
                <div
                  className={`content-view ${showMediaDetails ? 'hidden' : ''}`}
                >
                  {renderContent()}
                </div>
                <div
                  className={`content-view ${!showMediaDetails ? 'hidden' : ''}`}
                >
                  {renderMediaDetailsContent()}
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </>
    )
  }

  // For mobile - use Drawer
  return (
    <>
      <style>{transitionStyles}</style>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="h-[90vh] text-foreground">
          <DrawerHeader className="mb-6 shrink-0">
            <div className="flex items-center justify-between">
              <DrawerTitle className="flex items-center gap-2 text-foreground text-xl">
                {request.contentType === 'movie' ? (
                  <Monitor className="w-5 h-5" />
                ) : (
                  <Tv className="w-5 h-5" />
                )}
                {request.contentTitle}
                {getStatusBadge()}
              </DrawerTitle>
              <Button
                variant="neutralnoShadow"
                size="sm"
                onClick={handleShowMediaDetails}
                disabled={tmdbMetadata.loading}
                className="flex items-center gap-2"
              >
                {tmdbMetadata.loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <ArrowLeftRight className="w-4 h-4" />
                    {showMediaDetails
                      ? 'Request Info'
                      : `${request.contentType === 'movie' ? 'Movie' : 'Show'} Info`}
                  </>
                )}
              </Button>
            </div>
            <DrawerDescription className="text-foreground">
              {showMediaDetails
                ? 'TMDB metadata and streaming information'
                : 'Approval request details and actions'}
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto pb-4 px-5">
            <div className="content-container h-full">
              <div
                className={`content-view ${showMediaDetails ? 'hidden' : ''}`}
              >
                {renderContent()}
              </div>
              <div
                className={`content-view ${!showMediaDetails ? 'hidden' : ''}`}
              >
                {renderMediaDetailsContent()}
              </div>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  )
}
