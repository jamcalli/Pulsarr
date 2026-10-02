import type { ApprovalStatus } from '@root/types/approval.types'
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
          className="bg-status-pending hover:bg-status-pending text-black"
        >
          <Clock className="w-3 h-3 mr-1" />
          Pending
        </Badge>
      )
    case 'approved':
      return (
        <Badge
          variant="default"
          className="bg-status-approved hover:bg-status-approved text-black"
        >
          <CheckCircle className="w-3 h-3 mr-1" />
          Approved
        </Badge>
      )
    case 'rejected':
      return (
        <Badge
          variant="warn"
          className="bg-status-rejected hover:bg-status-rejected text-black"
        >
          <XCircle className="w-3 h-3 mr-1" />
          Rejected
        </Badge>
      )
    case 'expired':
      return (
        <Badge
          variant="neutral"
          className="bg-status-expired hover:bg-status-expired text-black"
        >
          <AlertCircle className="w-3 h-3 mr-1" />
          Expired
        </Badge>
      )
    case 'auto_approved':
      return (
        <Badge
          variant="default"
          className="bg-status-auto-approved hover:bg-status-auto-approved text-black"
        >
          <Bot className="w-3 h-3 mr-1" />
          Auto-Approved
        </Badge>
      )
    default:
      return <Badge variant="neutral">{status}</Badge>
  }
}
