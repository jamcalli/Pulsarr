import type {
  QuotaStatusResponse,
  UserQuotaResponse,
} from '@root/schemas/quota/quota.schema'
import { formatQuotaType } from '@/features/plex/components/user/quota-utils'
import type { UserQuotas } from '@/stores/configStore'

type QuotaWithStatus = UserQuotaResponse & Partial<QuotaStatusResponse>

interface QuotaStatusCardProps {
  userQuotas?: UserQuotas | null
}

interface QuotaDisplayProps {
  title: string
  quota?: QuotaWithStatus | null
}

/**
 * Displays a summary card for a specific user quota, showing usage, limit, status, and details.
 *
 * Renders the quota title, current usage versus limit with percentage, quota type, status label, and a description. If a reset date is present, it is displayed. If no quota is configured, a message indicating this is shown.
 *
 * @param title - The display title for the quota (e.g., "Movies" or "Shows")
 * @param quota - The quota data to display, or null if not configured
 */
function QuotaDisplay({ title, quota }: QuotaDisplayProps) {
  if (!quota) {
    return (
      <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-md">
        <h4 className="font-medium text-foreground mb-1">{title}</h4>
        <p className="text-sm text-foreground">No quota configured</p>
      </div>
    )
  }

  const currentUsage = quota.currentUsage ?? 0
  const percentage =
    quota.quotaLimit > 0 ? (currentUsage / quota.quotaLimit) * 100 : 0
  const isExceeded = percentage >= 100
  const isWarning = percentage >= 80
  const isCaution = percentage >= 60

  const getStatusInfo = () => {
    if (quota.bypassApproval) {
      return {
        title: 'Auto-Approve',
        color: 'text-blue-600 dark:text-blue-400',
        description: 'Auto-approval enabled when exceeded',
      }
    }
    if (isExceeded) {
      return {
        title: 'Exceeded',
        color: 'text-red-600 dark:text-red-400',
        description: 'Quota exceeded',
      }
    }
    if (isWarning) {
      return {
        title: 'Warning',
        color: 'text-orange-600 dark:text-orange-400',
        description: 'Approaching limit',
      }
    }
    if (isCaution) {
      return {
        title: 'Caution',
        color: 'text-yellow-600 dark:text-yellow-400',
        description: 'Over half used',
      }
    }
    return {
      title: 'Active',
      color: 'text-green-600 dark:text-green-400',
      description: 'Within limits',
    }
  }

  const statusInfo = getStatusInfo()

  return (
    <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-md">
      <div className="flex items-center justify-between mb-1">
        <h4 className="font-medium text-foreground">{title}</h4>
        <span className={`text-sm font-medium ${statusInfo.color}`}>
          {statusInfo.title}
        </span>
      </div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-foreground">
          {currentUsage}/{quota.quotaLimit} ({Math.round(percentage)}%)
        </span>
        <span className="text-xs text-foreground">
          {formatQuotaType(quota.quotaType)}
        </span>
      </div>
      <p className="text-xs text-foreground">
        {statusInfo.description}
        {quota.resetDate && (
          <>
            {' • '}
            Resets: {new Date(quota.resetDate).toLocaleDateString()}
          </>
        )}
      </p>
    </div>
  )
}

/**
 * Displays a summary card of the user's quota status for movies and shows.
 *
 * Shows quota usage and status for each category if quota data is provided. If no quotas are configured, displays an informational message indicating the user has no quota restrictions.
 *
 * @param userQuotas - The user's quota information for movies and shows, or null if not configured.
 */
export function QuotaStatusCard({ userQuotas }: QuotaStatusCardProps) {
  if (!userQuotas) {
    return (
      <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-md">
        <h3 className="font-medium text-foreground mb-2">
          No Quotas Configured
        </h3>
        <p className="text-sm text-foreground">
          This user has no quota restrictions configured. They can make
          unlimited content requests and will not require approval based on
          quota limits. Individual requests may still require approval based on
          other routing rules and criteria.
        </p>
      </div>
    )
  }

  const hasAnyQuota = userQuotas.movieQuota || userQuotas.showQuota

  if (!hasAnyQuota) {
    return (
      <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-md">
        <h3 className="font-medium text-foreground mb-2">
          No Quotas Configured
        </h3>
        <p className="text-sm text-foreground">
          This user has no quota restrictions configured for either movies or
          shows.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-md">
      <h3 className="font-medium text-foreground mb-3">Quota Status</h3>
      <div className="space-y-3">
        <QuotaDisplay title="Movies" quota={userQuotas.movieQuota} />
        <QuotaDisplay title="Shows" quota={userQuotas.showQuota} />
      </div>
    </div>
  )
}
