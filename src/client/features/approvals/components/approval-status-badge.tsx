import type { ApprovalRequestResponse } from '@root/schemas/approval/approval.schema'

type ApprovalStatus = ApprovalRequestResponse['status']

import { AlertCircle, Bot, CheckCircle, Clock, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface ApprovalStatusBadgeProps {
  status: ApprovalStatus
}

/**
 * Displays a styled badge for an approval request status.
 *
 * Each status has a distinct color and icon for quick visual identification:
 * - pending: yellow with clock icon
 * - approved: green with check icon
 * - rejected: red with X icon
 * - expired: gray with alert icon
 * - auto_approved: blue with bot icon
 */
export function ApprovalStatusBadge({ status }: ApprovalStatusBadgeProps) {
  switch (status) {
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
      return <Badge variant="neutral">{status}</Badge>
  }
}
