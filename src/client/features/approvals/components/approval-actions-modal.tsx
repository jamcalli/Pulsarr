import type { ApprovalRequestResponse } from '@root/schemas/approval/approval.schema'
import { format } from 'date-fns'
import {
  AlertCircle,
  ArrowLeftRight,
  Bot,
  Calendar,
  Check,
  CheckCircle,
  Clock,
  Loader2,
  Monitor,
  Trash2,
  Tv,
  User,
  XCircle,
} from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { TmdbContentViewer } from '@/components/tmdb-content-viewer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ApprovalRadarrRoutingCard } from '@/features/approvals/components/approval-radarr-routing-card'
import { ApprovalSonarrRoutingCard } from '@/features/approvals/components/approval-sonarr-routing-card'
import { useApprovalModalActions } from '@/features/approvals/hooks/useApprovalModalActions'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useConfigStore } from '@/stores/configStore'

interface ApprovalActionsModalProps {
  request: ApprovalRequestResponse
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Render a responsive modal/drawer UI for viewing and managing a single approval request.
 *
 * The component displays request metadata, proposed routing (with editable routing cards),
 * approval history, optional TMDB media details, and action controls to approve, reject, or
 * delete the request. It manages local loading/success states for those actions, enforces a
 * short minimum loading duration for UX consistency, and adapts layout for desktop (Sheet)
 * and mobile (Drawer). Media details are toggled on demand and reset when the modal opens or
 * the request changes.
 *
 * @param request - The ApprovalRequestResponse to show and act on.
 * @param open - Whether the modal/drawer is open.
 * @param onOpenChange - Callback invoked with the new open state to control visibility.
 * @returns A React element containing the approval actions modal UI.
 */
export default function ApprovalActionsModal({
  request,
  open,
  onOpenChange,
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
  const actionNotesId = useId()
  const [showMediaDetails, setShowMediaDetails] = useState(false)

  // Use the actions hook for all action-related state and handlers
  const {
    action,
    notes,
    setNotes,
    editRoutingMode,
    setEditRoutingMode,
    submitSectionRef,
    approveRequest,
    rejectRequest,
    deleteApproval,
    updateApproval,
    handleApprove,
    handleReject,
    handleDelete,
    handleRoutingSave,
    handleActionSelection,
    handleCancelAction,
    handleCancelRouting,
    isExpired,
    canApprove,
    canReject,
    canDelete,
    isAnyActionInProgress,
  } = useApprovalModalActions({ request, onOpenChange })

  const users = useConfigStore((state) => state.users)
  const isMobile = useMediaQuery('(max-width: 768px)')
  const isDesktop = !isMobile

  // Reset media details when modal opens or the request changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: Need request.id to reset when request changes while modal stays open
  useEffect(() => {
    if (open) setShowMediaDetails(false)
  }, [open, request.id])

  // Reset edit routing mode when request changes
  useEffect(() => {
    setEditRoutingMode(false)
  }, [setEditRoutingMode])

  const getUserName = (userId: number) => {
    const user = users?.find((u) => u.id === userId)
    return user?.name || `User ${userId}`
  }

  const handleShowMediaDetails = () => {
    setShowMediaDetails((v) => !v)
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
      case 'auto_approved':
        return (
          <Badge
            variant="default"
            className="bg-blue-500 hover:bg-blue-500 text-black"
          >
            <Bot className="w-3 h-3 mr-1" />
            Auto-Approved
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
    <div className="space-y-6 pb-2 pr-3">
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">
          Media Details
        </h3>

        {showMediaDetails && <TmdbContentViewer approvalRequest={request} />}
      </div>
    </div>
  )

  const renderContent = () => (
    <div className="space-y-6 pb-2 pr-3">
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

          {request.status === 'approved' ||
          request.status === 'rejected' ||
          request.status === 'auto_approved' ? (
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
                        request.status === 'expired' ||
                        request.status === 'auto_approved'
                      }
                    >
                      Edit Routing
                    </Button>
                  </div>
                </TooltipTrigger>
                {(request.status === 'approved' ||
                  request.status === 'expired' ||
                  request.status === 'auto_approved') && (
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
                onCancel={handleCancelRouting}
                disabled={!editRoutingMode || isAnyActionInProgress}
                isSaving={updateApproval.isPending}
                saveSuccess={updateApproval.isSuccess}
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
                onCancel={handleCancelRouting}
                disabled={!editRoutingMode || isAnyActionInProgress}
                isSaving={updateApproval.isPending}
                saveSuccess={updateApproval.isSuccess}
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
              {(request.status === 'approved' ||
                request.status === 'auto_approved') &&
                request.approvedBy && (
                  <div className="flex items-start gap-2 text-green-600 dark:text-green-400">
                    <CheckCircle className="w-5 h-5 mt-0.5" />
                    <div>
                      <div className="font-medium">
                        Approved by {getUserName(request.approvedBy)}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {format(
                          new Date(request.updatedAt),
                          'MMM d, yyyy HH:mm',
                        )}
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
                          htmlFor={actionNotesId}
                          className="text-foreground"
                        >
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
                          (action === 'approve' &&
                            (approveRequest.isPending ||
                              approveRequest.isSuccess)) ||
                          (action === 'reject' &&
                            (rejectRequest.isPending ||
                              rejectRequest.isSuccess)) ||
                          (action === 'delete' &&
                            (deleteApproval.isPending ||
                              deleteApproval.isSuccess))
                        }
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
                        disabled={
                          (action === 'approve' &&
                            (approveRequest.isPending ||
                              approveRequest.isSuccess)) ||
                          (action === 'reject' &&
                            (rejectRequest.isPending ||
                              rejectRequest.isSuccess)) ||
                          (action === 'delete' &&
                            (deleteApproval.isPending ||
                              deleteApproval.isSuccess))
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
                  className="flex items-center gap-2"
                  aria-pressed={showMediaDetails}
                >
                  <ArrowLeftRight className="w-4 h-4" />
                  {showMediaDetails
                    ? 'Request Info'
                    : `${request.contentType === 'movie' ? 'Movie' : 'Show'} Info`}
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
                  aria-hidden={showMediaDetails}
                >
                  {renderContent()}
                </div>
                <div
                  className={`content-view ${!showMediaDetails ? 'hidden' : ''}`}
                  aria-hidden={!showMediaDetails}
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
                className="flex items-center gap-2"
                aria-pressed={showMediaDetails}
              >
                <ArrowLeftRight className="w-4 h-4" />
                {showMediaDetails
                  ? 'Request Info'
                  : `${request.contentType === 'movie' ? 'Movie' : 'Show'} Info`}
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
                aria-hidden={showMediaDetails}
              >
                {renderContent()}
              </div>
              <div
                className={`content-view ${!showMediaDetails ? 'hidden' : ''}`}
                aria-hidden={!showMediaDetails}
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
