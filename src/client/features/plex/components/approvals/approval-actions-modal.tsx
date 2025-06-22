import { useState } from 'react'
import { format } from 'date-fns'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useConfigStore } from '@/stores/configStore'
import { useApprovalsStore } from '@/features/plex/store/approvalsStore'
import type { ApprovalRequestResponse } from '@root/schemas/approval/approval.schema'

interface ApprovalActionsModalProps {
  request: ApprovalRequestResponse
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdate?: () => Promise<void>
}

/**
 * Modal component for viewing and taking actions on approval requests.
 *
 * Provides detailed view of approval request information and allows users
 * to approve or reject requests with optional notes. Shows comprehensive
 * routing information and request history.
 */
export default function ApprovalActionsModal({
  request,
  open,
  onOpenChange,
  onUpdate,
}: ApprovalActionsModalProps) {
  const [action, setAction] = useState<'approve' | 'reject' | null>(null)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()
  const { approveRequest, rejectRequest } = useApprovalsStore()
  const users = useConfigStore((state) => state.users)

  // TODO: Replace with actual current user ID when multi-admin support is added
  // Currently the system only supports one admin user with ID 1
  const currentAdminId = 1

  const getUserName = (userId: number) => {
    const user = users?.find((u) => u.id === userId)
    return user?.name || `User ${userId}`
  }

  const handleAction = async () => {
    if (!action) return

    setLoading(true)
    try {
      if (action === 'approve') {
        await approveRequest(
          request.id,
          currentAdminId,
          notes.trim() || undefined,
        )
        toast({
          title: 'Success',
          description: 'Approval request approved and processed successfully',
        })
      } else {
        await rejectRequest(
          request.id,
          currentAdminId,
          notes.trim() || undefined,
        )
        toast({
          title: 'Success',
          description: 'Approval request rejected successfully',
        })
      }

      if (onUpdate) {
        await onUpdate()
      }
      onOpenChange(false)
      setAction(null)
      setNotes('')
    } catch (error) {
      toast({
        title: 'Error',
        description: `Failed to ${action} approval request`,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const canTakeAction = request.status === 'pending'
  const isExpired =
    request.expiresAt && new Date(request.expiresAt) < new Date()

  const getStatusBadge = () => {
    switch (request.status) {
      case 'pending':
        return <Badge variant="warn">Pending</Badge>
      case 'approved':
        return <Badge variant="default">Approved</Badge>
      case 'rejected':
        return <Badge variant="neutral">Rejected</Badge>
      case 'expired':
        return <Badge variant="neutral">Expired</Badge>
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {request.contentType === 'movie' ? (
              <Monitor className="w-5 h-5" />
            ) : (
              <Tv className="w-5 h-5" />
            )}
            {request.contentTitle}
            {getStatusBadge()}
          </DialogTitle>
          <DialogDescription>
            Approval request details and actions
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6">
          {/* Request Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Request Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
            </CardContent>
          </Card>

          {/* Proposed Routing */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Proposed Routing</CardTitle>
            </CardHeader>
            <CardContent>
              {getRoutingInfo() || (
                <p className="text-gray-500 dark:text-gray-400">
                  No routing information available
                </p>
              )}
            </CardContent>
          </Card>

          {/* Approval History */}
          {(request.status !== 'pending' || request.approvalNotes) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Approval History</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {request.status === 'approved' && request.approvedBy && (
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
              </CardContent>
            </Card>
          )}

          {/* Action Selection */}
          {canTakeAction && !isExpired && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Take Action</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-4">
                  <Button
                    variant={action === 'approve' ? 'default' : 'neutral'}
                    onClick={() =>
                      setAction(action === 'approve' ? null : 'approve')
                    }
                    className="flex-1"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Approve Request
                  </Button>
                  <Button
                    variant={action === 'reject' ? 'error' : 'neutral'}
                    onClick={() =>
                      setAction(action === 'reject' ? null : 'reject')
                    }
                    className="flex-1"
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Reject Request
                  </Button>
                </div>

                {action && (
                  <>
                    <Separator />
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
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                          setNotes(e.target.value)
                        }
                        rows={3}
                      />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter>
          <Button variant="neutral" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {action && canTakeAction && !isExpired && (
            <Button
              onClick={handleAction}
              disabled={loading}
              variant={action === 'approve' ? 'default' : 'error'}
            >
              {loading
                ? 'Processing...'
                : action === 'approve'
                  ? 'Approve & Execute'
                  : 'Reject Request'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
