import type { QuotaStatusResponse } from '@root/schemas/quota/quota.schema'
import { formatQuotaType } from '@/features/plex/components/user/quota-utils'

interface QuotaStatusCardProps {
  quotaStatus?: QuotaStatusResponse | null
}

/**
 * Renders a quota status card with detailed information, styled to match the public content broadcasting card
 */
export function QuotaStatusCard({ quotaStatus }: QuotaStatusCardProps) {
  if (!quotaStatus) {
    return (
      <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-md">
        <h3 className="font-medium text-text mb-2">No Quota Configured</h3>
        <p className="text-sm text-text">
          This user has no quota restrictions configured. They can make
          unlimited content requests and will not require approval based on
          quota limits. Individual requests may still require approval based on
          other routing rules and criteria.
        </p>
      </div>
    )
  }

  if (quotaStatus.bypassApproval) {
    const percentage = (quotaStatus.currentUsage / quotaStatus.quotaLimit) * 100
    return (
      <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-md">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium text-blue-600 dark:text-blue-400">
            Auto-Approve When Exceeded
          </h3>
          <span className="text-sm font-medium text-text">
            {quotaStatus.currentUsage}/{quotaStatus.quotaLimit} (
            {Math.round(percentage)}%)
          </span>
        </div>
        <p className="text-sm text-text">
          This user has a {formatQuotaType(quotaStatus.quotaType)} quota with
          auto-approval enabled. When quota limits are exceeded, requests will
          be automatically approved instead of requiring manual approval. Quota
          usage is still tracked and displayed for monitoring purposes.
          {quotaStatus.resetDate && (
            <>
              {' '}
              Next reset: {new Date(quotaStatus.resetDate).toLocaleDateString()}
              .
            </>
          )}
        </p>
      </div>
    )
  }

  const percentage = (quotaStatus.currentUsage / quotaStatus.quotaLimit) * 100
  const isExceeded = percentage >= 100
  const isWarning = percentage >= 80
  const isCaution = percentage >= 60

  const getStatusInfo = () => {
    if (isExceeded) {
      return {
        title: 'Quota Exceeded',
        description:
          'This user has exceeded their quota limit. New requests will require manual approval until the quota resets.',
        color: 'text-red-600 dark:text-red-400',
      }
    }
    if (isWarning) {
      return {
        title: 'Quota Warning',
        description:
          'This user is approaching their quota limit. Monitor usage to prevent exceeding limits.',
        color: 'text-orange-600 dark:text-orange-400',
      }
    }
    if (isCaution) {
      return {
        title: 'Quota Caution',
        description:
          'This user has used over half of their quota allocation. Usage is being monitored.',
        color: 'text-yellow-600 dark:text-yellow-400',
      }
    }
    return {
      title: 'Quota Active',
      description:
        'This user has an active quota with remaining allocation. Requests are processed normally.',
      color: 'text-green-600 dark:text-green-400',
    }
  }

  const statusInfo = getStatusInfo()

  return (
    <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-md">
      <div className="flex items-center justify-between mb-2">
        <h3 className={`font-medium ${statusInfo.color}`}>
          {statusInfo.title}
        </h3>
        <span className="text-sm font-medium text-text">
          {quotaStatus.currentUsage}/{quotaStatus.quotaLimit} (
          {Math.round(percentage)}%)
        </span>
      </div>
      <p className="text-sm text-text">
        {statusInfo.description} This is a{' '}
        {formatQuotaType(quotaStatus.quotaType)} quota cycle.
        {quotaStatus.resetDate && (
          <>
            {' '}
            Next reset: {new Date(quotaStatus.resetDate).toLocaleDateString()}.
          </>
        )}
      </p>
    </div>
  )
}
