import type {
  QuotaStatusResponse,
  UserQuotaResponse,
} from '@root/schemas/quota/quota.schema'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { UserQuotas } from '@/stores/configStore'

type QuotaWithStatus = UserQuotaResponse & Partial<QuotaStatusResponse>

interface QuotaStatusBadgeProps {
  userQuotas?: UserQuotas | null
}

const QUOTA_TYPE_SHORT: Record<string, string> = {
  daily: 'daily',
  weekly_rolling: 'weekly',
  monthly: 'monthly',
}

function getBadgeColor(pct: number) {
  if (pct >= 100) return 'bg-red-500 hover:bg-red-500 text-black'
  if (pct >= 80) return 'bg-orange-500 hover:bg-orange-500 text-black'
  if (pct >= 60) return 'bg-yellow-500 hover:bg-yellow-500 text-black'
  return 'bg-green-500 hover:bg-green-500 text-black'
}

function SingleQuotaRow({
  type,
  quota,
}: {
  type: 'movie' | 'show'
  quota: QuotaWithStatus | null
}) {
  const prefix = type === 'movie' ? 'M' : 'S'

  if (!quota) {
    return (
      <Badge
        variant="neutral"
        className="px-1.5 py-0.5 h-5 text-xs bg-gray-400 hover:bg-gray-400 text-black"
      >
        {prefix}: None
      </Badge>
    )
  }

  if (quota.bypassApproval) {
    return (
      <Badge
        variant="neutral"
        className="px-1.5 py-0.5 h-5 text-xs bg-blue-500 hover:bg-blue-500 text-black"
      >
        {prefix}: Auto
      </Badge>
    )
  }

  const currentUsage = quota.currentUsage ?? 0
  const periodLabel = QUOTA_TYPE_SHORT[quota.quotaType] ?? quota.quotaType
  const lifetimeUsage = quota.lifetimeUsage ?? 0
  const lifetimeLimit = quota.lifetimeLimit ?? 0
  const hasLifetime = lifetimeLimit > 0

  if (quota.quotaLimit <= 0) {
    return (
      <Badge
        variant="neutral"
        className="px-1.5 py-0.5 h-5 text-xs bg-green-500 hover:bg-green-500 text-black"
      >
        {prefix}: {currentUsage}/∞
      </Badge>
    )
  }

  const periodPct = (currentUsage / quota.quotaLimit) * 100
  const lifetimePct = hasLifetime ? (lifetimeUsage / lifetimeLimit) * 100 : 0
  // Use the worst percentage for the row color
  const worstPct = hasLifetime ? Math.max(periodPct, lifetimePct) : periodPct

  const label = hasLifetime
    ? `${prefix}: ${currentUsage}/${quota.quotaLimit} ${periodLabel} · L: ${lifetimeUsage}/${lifetimeLimit}`
    : `${prefix}: ${currentUsage}/${quota.quotaLimit} ${periodLabel}`

  return (
    <Badge
      variant="neutral"
      className={cn('px-1.5 py-0.5 h-5 text-xs', getBadgeColor(worstPct))}
    >
      {label}
    </Badge>
  )
}

export function QuotaStatusBadge({ userQuotas }: QuotaStatusBadgeProps) {
  if (!userQuotas || (!userQuotas.movieQuota && !userQuotas.showQuota)) {
    return (
      <Badge
        variant="neutral"
        className="px-2 py-0.5 h-5 text-xs bg-gray-400 hover:bg-gray-400 text-black"
      >
        No Quota
      </Badge>
    )
  }

  return (
    <div className="flex flex-col gap-0.5 items-center">
      {userQuotas.movieQuota && (
        <SingleQuotaRow type="movie" quota={userQuotas.movieQuota} />
      )}
      {userQuotas.showQuota && (
        <SingleQuotaRow type="show" quota={userQuotas.showQuota} />
      )}
    </div>
  )
}
