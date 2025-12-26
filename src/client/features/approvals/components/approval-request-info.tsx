import type { ApprovalRequestResponse } from '@root/schemas/approval/approval.schema'
import { format } from 'date-fns'
import { AlertCircle, Calendar, User } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface ApprovalRequestInfoProps {
  request: ApprovalRequestResponse
  getUserName: (userId: number) => string
}

/**
 * Displays the request information section of an approval modal.
 *
 * Shows user, creation date, content type, trigger reason, expiry/resolution dates,
 * approval reason, and content GUIDs.
 */
export function ApprovalRequestInfo({
  request,
  getUserName,
}: ApprovalRequestInfoProps) {
  const isExpired =
    request.expiresAt && new Date(request.expiresAt) < new Date()

  const getTriggerInfo = () => {
    const triggerLabels: Record<string, string> = {
      quota_exceeded: 'Quota Exceeded',
      router_rule: 'Router Rule',
      manual_flag: 'Manual Flag',
      content_criteria: 'Content Criteria',
    }
    return triggerLabels[request.triggeredBy] || request.triggeredBy
  }

  const isResolved =
    request.status === 'approved' ||
    request.status === 'rejected' ||
    request.status === 'auto_approved'

  return (
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

        {isResolved ? (
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
            <span className="font-medium text-foreground">Content GUIDs:</span>
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
  )
}
