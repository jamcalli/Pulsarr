import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { QuotaStatusResponse } from '@root/schemas/quota/quota.schema'

interface QuotaStatusBadgeProps {
  quotaStatus?: QuotaStatusResponse | null
}

/**
 * Renders a quota status badge with progress colors matching workflow status badges
 */
export function QuotaStatusBadge({ quotaStatus }: QuotaStatusBadgeProps) {
  if (!quotaStatus) {
    return (
      <Badge
        variant="neutral"
        className="px-2 py-0.5 h-7 text-sm bg-gray-400 hover:bg-gray-400 text-white"
      >
        No Quota
      </Badge>
    )
  }

  if (quotaStatus.bypassApproval) {
    return (
      <Badge
        variant="neutral"
        className="px-2 py-0.5 h-7 text-sm bg-blue-500 hover:bg-blue-500 text-white"
      >
        Auto-Approve
      </Badge>
    )
  }

  const percentage = (quotaStatus.currentUsage / quotaStatus.quotaLimit) * 100

  // Use exact workflow status badge colors
  const getBadgeColor = () => {
    if (percentage >= 100) {
      return 'bg-red-500 hover:bg-red-500 text-white' // Exceeded (red)
    }
    if (percentage >= 80) {
      return 'bg-orange-500 hover:bg-orange-500 text-white' // Warning (orange)
    }
    if (percentage >= 60) {
      return 'bg-yellow-500 hover:bg-yellow-500 text-white' // Caution (yellow)
    }
    return 'bg-green-500 hover:bg-green-500 text-white' // Good (green)
  }

  return (
    <Badge
      variant="neutral"
      className={cn('px-2 py-0.5 h-7 text-sm', getBadgeColor())}
    >
      {quotaStatus.currentUsage}/{quotaStatus.quotaLimit}
    </Badge>
  )
}
