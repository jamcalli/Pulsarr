import type { ApprovalRequestResponse } from '@root/schemas/approval/approval.schema'
import { format } from 'date-fns'
import { CheckCircle, XCircle } from 'lucide-react'

interface ApprovalHistoryProps {
  request: ApprovalRequestResponse
  getUserName: (userId: number) => string
}

/**
 * Displays the approval history section showing who approved/rejected the request and when.
 *
 * Only renders content when the request has been resolved (approved/rejected/auto_approved)
 * or has approval notes.
 */
export function ApprovalHistory({
  request,
  getUserName,
}: ApprovalHistoryProps) {
  const showHistory = request.status !== 'pending' || request.approvalNotes

  if (!showHistory) {
    return null
  }

  return (
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
                  {format(new Date(request.updatedAt), 'MMM d, yyyy HH:mm')}
                </div>
                {request.approvalNotes && (
                  <div className="text-sm mt-1">{request.approvalNotes}</div>
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
                <div className="text-sm mt-1">{request.approvalNotes}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
