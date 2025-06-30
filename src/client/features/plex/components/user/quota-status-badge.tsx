import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { UserQuotas } from '@/stores/configStore'
import type {
  UserQuotaResponse,
  QuotaStatusResponse,
} from '@root/schemas/quota/quota.schema'

type QuotaWithStatus = UserQuotaResponse & Partial<QuotaStatusResponse>

interface QuotaStatusBadgeProps {
  userQuotas?: UserQuotas | null
}

/**
 * Renders a badge showing quota usage or status for either movies or shows.
 *
 * Displays a colored badge with an initial ("M" for movie, "S" for show) and usage details. Shows "None" if no quota is set, "Auto" if approval is bypassed, or the current usage and limit otherwise. Badge color indicates usage severity.
 *
 * @param type - Indicates whether the badge is for movies or shows
 * @param quota - The quota data object, or null if no quota is set
 */
function SingleQuotaBadge({
  type,
  quota,
}: {
  type: 'movie' | 'show'
  quota: QuotaWithStatus | null
}) {
  if (!quota) {
    return (
      <Badge
        variant="neutral"
        className="px-1.5 py-0.5 h-6 text-xs bg-gray-400 hover:bg-gray-400 text-black"
      >
        {type === 'movie' ? 'M' : 'S'}: None
      </Badge>
    )
  }

  if (quota.bypassApproval) {
    return (
      <Badge
        variant="neutral"
        className="px-1.5 py-0.5 h-6 text-xs bg-blue-500 hover:bg-blue-500 text-black"
      >
        {type === 'movie' ? 'M' : 'S'}: Auto
      </Badge>
    )
  }

  const currentUsage = quota.currentUsage ?? 0
  const percentage =
    quota.quotaLimit > 0 ? (currentUsage / quota.quotaLimit) * 100 : 0

  const getBadgeColor = () => {
    if (percentage >= 100) return 'bg-red-500 hover:bg-red-500 text-black'
    if (percentage >= 80) return 'bg-orange-500 hover:bg-orange-500 text-black'
    if (percentage >= 60) return 'bg-yellow-500 hover:bg-yellow-500 text-black'
    return 'bg-green-500 hover:bg-green-500 text-black'
  }

  return (
    <Badge
      variant="neutral"
      className={cn('px-1.5 py-0.5 h-6 text-xs', getBadgeColor())}
    >
      {type === 'movie' ? 'M' : 'S'}:{currentUsage}/{quota.quotaLimit}
    </Badge>
  )
}

/**
 * Renders badges indicating the user's quota usage for movies and shows.
 *
 * If no quota data is provided or both quotas are absent, displays a neutral badge labeled "No Quota". Otherwise, shows individual badges for each available quota type.
 */
export function QuotaStatusBadge({ userQuotas }: QuotaStatusBadgeProps) {
  if (!userQuotas || (!userQuotas.movieQuota && !userQuotas.showQuota)) {
    return (
      <Badge
        variant="neutral"
        className="px-2 py-0.5 h-7 text-sm bg-gray-400 hover:bg-gray-400 text-black"
      >
        No Quota
      </Badge>
    )
  }

  return (
    <div className="flex gap-1 justify-center">
      {userQuotas.movieQuota && (
        <SingleQuotaBadge type="movie" quota={userQuotas.movieQuota} />
      )}
      {userQuotas.showQuota && (
        <SingleQuotaBadge type="show" quota={userQuotas.showQuota} />
      )}
    </div>
  )
}
