import type { ApprovalRequestResponse } from '@root/schemas/approval/approval.schema'
import { ArrowLeftRight, Monitor, Tv } from 'lucide-react'
import { useEffect, useState } from 'react'
import { TmdbContentViewer } from '@/components/tmdb-content-viewer'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ApprovalActionForm } from '@/features/approvals/components/approval-action-form'
import { ApprovalHistory } from '@/features/approvals/components/approval-history'
import { ApprovalRadarrRoutingCard } from '@/features/approvals/components/approval-radarr-routing-card'
import { ApprovalRequestInfo } from '@/features/approvals/components/approval-request-info'
import { ApprovalSonarrRoutingCard } from '@/features/approvals/components/approval-sonarr-routing-card'
import { ApprovalStatusBadge } from '@/features/approvals/components/approval-status-badge'
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
      <ApprovalRequestInfo request={request} getUserName={getUserName} />

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
          <ApprovalHistory request={request} getUserName={getUserName} />
        </>
      )}

      {/* Action Selection */}
      {(canApprove || canReject || canDelete) && !isExpired && (
        <>
          <Separator />
          <ApprovalActionForm
            action={action}
            notes={notes}
            setNotes={setNotes}
            submitSectionRef={submitSectionRef}
            approveRequest={approveRequest}
            rejectRequest={rejectRequest}
            deleteApproval={deleteApproval}
            handleApprove={handleApprove}
            handleReject={handleReject}
            handleDelete={handleDelete}
            handleActionSelection={handleActionSelection}
            handleCancelAction={handleCancelAction}
            canApprove={canApprove}
            canReject={canReject}
            canDelete={canDelete}
            isAnyActionInProgress={isAnyActionInProgress}
          />
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
                  <ApprovalStatusBadge status={request.status} />
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
                <ApprovalStatusBadge status={request.status} />
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
