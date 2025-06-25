import type { UserQuotas } from '@/stores/configStore'
import { formatQuotaType } from '@/features/plex/components/user/quota-utils'
import type {
  UserQuotaResponse,
  QuotaStatusResponse,
} from '@root/schemas/quota/quota.schema'

type QuotaWithStatus = UserQuotaResponse & Partial<QuotaStatusResponse>

interface QuotaStatusCardProps {
  userQuotas?: UserQuotas | null
}

interface QuotaDisplayProps {
  title: string
  quota?: QuotaWithStatus | null
}

/**
 * Displays a card summarizing the status and usage of a specific user quota.
 *
 * Shows the quota title, current usage, usage percentage, quota type, status label, and a description. If a reset date is present, it is also displayed. If no quota is configured, a message is shown instead.
 *
 * @param title - The display title for the quota (e.g., "Movies" or "Shows")
 * @param quota - The quota data to display, or null if not configured
 */
function QuotaDisplay({ title, quota }: QuotaDisplayProps) {
  if (!quota) {
    return (
      <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-md">
        <h4 className="font-medium text-text mb-1">{title}</h4>
        <p className="text-sm text-text">No quota configured</p>
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
        <h4 className="font-medium text-text">{title}</h4>
        <span className={`text-sm font-medium ${statusInfo.color}`}>
          {statusInfo.title}
        </span>
      </div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-text">
          {currentUsage}/{quota.quotaLimit} ({Math.round(percentage)}%)
        </span>
        <span className="text-xs text-text">
          {formatQuotaType(quota.quotaType)}
        </span>
      </div>
      <p className="text-xs text-text">
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
 * Displays the user's quota status for movies and shows, or indicates if no quotas are configured.
 *
 * Renders quota information for both movies and shows using `QuotaDisplay` components if quotas are present. If no quotas are configured, displays a message indicating the user has no quota restrictions.
 *
 * @param userQuotas - The user's quota data for movies and shows, or null if not configured.
 */
export function QuotaStatusCard({ userQuotas }: QuotaStatusCardProps) {
  if (!userQuotas) {
    return (
      <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-md">
        <h3 className="font-medium text-text mb-2">No Quotas Configured</h3>
        <p className="text-sm text-text">
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
        <h3 className="font-medium text-text mb-2">No Quotas Configured</h3>
        <p className="text-sm text-text">
          This user has no quota restrictions configured for either movies or
          shows.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-md">
      <h3 className="font-medium text-text mb-3">Quota Status</h3>
      <div className="space-y-3">
        <QuotaDisplay title="Movies" quota={userQuotas.movieQuota} />
        <QuotaDisplay title="Shows" quota={userQuotas.showQuota} />
      </div>
    </div>
  )
}
