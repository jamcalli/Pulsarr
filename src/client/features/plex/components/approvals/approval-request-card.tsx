import { useState } from 'react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  Clock,
  User,
  Calendar,
  CheckCircle,
  XCircle,
  AlertCircle,
  Trash2,
  Eye,
  Monitor,
  Tv,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useConfigStore } from '@/stores/configStore'
import { useApprovalsStore } from '@/features/plex/store/approvalsStore'
import type { ApprovalRequestResponse } from '@root/schemas/approval/approval.schema'
import ApprovalActionsModal from './approval-actions-modal'

interface ApprovalRequestCardProps {
  request: ApprovalRequestResponse
  onUpdate?: () => Promise<void>
}

/**
 * Individual approval request card component displaying request details and actions.
 *
 * Shows comprehensive information about each approval request including content details,
 * status, routing information, and available actions. Provides quick approve/reject
 * functionality and detailed view modal.
 */
export default function ApprovalRequestCard({
  request,
  onUpdate,
}: ApprovalRequestCardProps) {
  const [showActionsModal, setShowActionsModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()
  const { deleteApprovalRequest } = useApprovalsStore()
  const users = useConfigStore((state) => state.users)

  const getUserName = (userId: number) => {
    const user = users?.find((u) => u.id === userId)
    return user?.name || `User ${userId}`
  }

  const getStatusBadge = () => {
    switch (request.status) {
      case 'pending':
        return (
          <Badge variant="warn" className="bg-yellow-100 text-yellow-800">
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        )
      case 'approved':
        return (
          <Badge variant="default" className="bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3 mr-1" />
            Approved
          </Badge>
        )
      case 'rejected':
        return (
          <Badge variant="neutral" className="bg-red-100 text-red-800">
            <XCircle className="w-3 h-3 mr-1" />
            Rejected
          </Badge>
        )
      case 'expired':
        return (
          <Badge variant="neutral" className="bg-gray-100 text-gray-800">
            <AlertCircle className="w-3 h-3 mr-1" />
            Expired
          </Badge>
        )
      default:
        return <Badge variant="neutral">{request.status}</Badge>
    }
  }

  const getTriggerBadge = () => {
    switch (request.triggeredBy) {
      case 'quota_exceeded':
        return (
          <Badge variant="warn" className="text-orange-600">
            Quota Exceeded
          </Badge>
        )
      case 'router_rule':
        return (
          <Badge variant="default" className="text-blue-600">
            Router Rule
          </Badge>
        )
      case 'manual_flag':
        return (
          <Badge variant="neutral" className="text-purple-600">
            Manual Flag
          </Badge>
        )
      case 'content_criteria':
        return (
          <Badge variant="neutral" className="text-indigo-600">
            Content Criteria
          </Badge>
        )
      default:
        return <Badge variant="neutral">{request.triggeredBy}</Badge>
    }
  }

  const getContentIcon = () => {
    return request.contentType === 'movie' ? (
      <Monitor className="w-4 h-4" />
    ) : (
      <Tv className="w-4 h-4" />
    )
  }

  const getProposedRoutingInfo = () => {
    const routing = request.proposedRouterDecision.approval?.proposedRouting
    if (!routing) return null

    return (
      <div className="text-sm text-gray-600 dark:text-gray-400">
        <span className="font-medium">Proposed: </span>
        {routing.instanceType.charAt(0).toUpperCase() +
          routing.instanceType.slice(1)}{' '}
        Instance {routing.instanceId}
        {routing.qualityProfile && <span> • {routing.qualityProfile}</span>}
        {routing.rootFolder && <span> • {routing.rootFolder}</span>}
      </div>
    )
  }

  const handleDelete = async () => {
    if (
      !confirm(
        'Are you sure you want to permanently delete this approval request?',
      )
    ) {
      return
    }

    setLoading(true)
    try {
      await deleteApprovalRequest(request.id)
      toast({
        title: 'Success',
        description: 'Approval request deleted successfully',
      })
      if (onUpdate) {
        await onUpdate()
      }
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

  const canTakeAction = request.status === 'pending'
  const isExpired =
    request.expiresAt && new Date(request.expiresAt) < new Date()

  return (
    <>
      <Card className={isExpired ? 'opacity-75' : ''}>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                {getContentIcon()}
                <h3 className="font-semibold text-lg text-text truncate">
                  {request.contentTitle}
                </h3>
                {getStatusBadge()}
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                <div className="flex items-center gap-1">
                  <User className="w-4 h-4" />
                  {getUserName(request.userId)}
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {format(new Date(request.createdAt), 'MMM d, yyyy HH:mm')}
                </div>
                {request.expiresAt && (
                  <div className="flex items-center gap-1 text-orange-600">
                    <AlertCircle className="w-4 h-4" />
                    Expires{' '}
                    {format(new Date(request.expiresAt), 'MMM d, yyyy HH:mm')}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="neutral"
                size="sm"
                onClick={() => setShowActionsModal(true)}
              >
                <Eye className="w-4 h-4 mr-1" />
                View
              </Button>
              <Button
                variant="error"
                size="sm"
                onClick={handleDelete}
                disabled={loading}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          <div className="grid gap-3">
            {/* Trigger and reason */}
            <div className="flex flex-wrap items-center gap-2">
              {getTriggerBadge()}
              {request.approvalReason && (
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  • {request.approvalReason}
                </span>
              )}
            </div>

            {/* Proposed routing */}
            {getProposedRoutingInfo()}

            {/* Content GUIDs */}
            {request.contentGuids.length > 0 && (
              <div className="text-sm text-gray-600 dark:text-gray-400">
                <span className="font-medium">Content IDs: </span>
                {request.contentGuids.slice(0, 3).join(', ')}
                {request.contentGuids.length > 3 &&
                  ` (+${request.contentGuids.length - 3} more)`}
              </div>
            )}

            {/* Approval info */}
            {request.status === 'approved' && request.approvedBy && (
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <CheckCircle className="w-4 h-4" />
                Approved by {getUserName(request.approvedBy)}
                {request.approvalNotes && (
                  <span>• {request.approvalNotes}</span>
                )}
              </div>
            )}

            {request.status === 'rejected' && (
              <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                <XCircle className="w-4 h-4" />
                Rejected
                {request.approvalNotes && (
                  <span>• {request.approvalNotes}</span>
                )}
              </div>
            )}

            {/* Quick actions for pending requests */}
            {canTakeAction && !isExpired && (
              <div className="flex gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                <Button
                  size="sm"
                  onClick={() => setShowActionsModal(true)}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle className="w-4 h-4 mr-1" />
                  Approve
                </Button>
                <Button
                  variant="error"
                  size="sm"
                  onClick={() => setShowActionsModal(true)}
                >
                  <XCircle className="w-4 h-4 mr-1" />
                  Reject
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Actions modal */}
      <ApprovalActionsModal
        request={request}
        open={showActionsModal}
        onOpenChange={setShowActionsModal}
        onUpdate={onUpdate}
      />
    </>
  )
}
