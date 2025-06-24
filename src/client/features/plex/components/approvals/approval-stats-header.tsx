import {
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  BarChart3,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import type { ApprovalStatsResponse } from '@root/schemas/approval/approval.schema'

interface ApprovalStatsHeaderProps {
  stats: ApprovalStatsResponse['stats'] | null
  loading?: boolean
}

/**
 * Stats overview header component displaying approval request statistics.
 *
 * Shows key metrics including pending, approved, rejected, and expired requests
 * in a visually appealing card layout. Includes loading states and handles
 * empty data gracefully.
 */
export default function ApprovalStatsHeader({
  stats,
  loading,
}: ApprovalStatsHeaderProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {['pending', 'approved', 'rejected', 'expired', 'total'].map((type) => (
          <div key={`skeleton-${type}`} className="bg-card p-4 rounded-md">
            <div className="flex items-center justify-between mb-3">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-4" />
            </div>
            <Skeleton className="h-8 w-12 mb-1" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-md">
        <div className="text-center text-gray-500 dark:text-gray-400">
          <BarChart3 className="w-8 h-8 mx-auto mb-2" />
          <p>Unable to load approval statistics</p>
        </div>
      </div>
    )
  }

  const statCards = [
    {
      title: 'Pending',
      value: stats.pending,
      icon: Clock,
      color: 'text-yellow-600 dark:text-yellow-400',
      bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
    },
    {
      title: 'Approved',
      value: stats.approved,
      icon: CheckCircle,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
    },
    {
      title: 'Rejected',
      value: stats.rejected,
      icon: XCircle,
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-50 dark:bg-red-900/20',
    },
    {
      title: 'Expired',
      value: stats.expired,
      icon: AlertCircle,
      color: 'text-gray-600 dark:text-gray-400',
      bgColor: 'bg-gray-50 dark:bg-gray-900/20',
    },
    {
      title: 'Total',
      value: stats.totalRequests,
      icon: BarChart3,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    },
  ]

  const getPercentage = (value: number) => {
    return stats.totalRequests > 0
      ? Math.round((value / stats.totalRequests) * 100)
      : 0
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {statCards.map((stat) => {
        const Icon = stat.icon
        const percentage =
          stat.title !== 'Total' ? getPercentage(stat.value) : null

        return (
          <div
            key={stat.title}
            className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-md"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-text">{stat.title}</h3>
              <Icon className={`h-4 w-4 ${stat.color}`} />
            </div>
            <div className={`text-2xl font-bold ${stat.color} mb-1`}>
              {stat.value.toLocaleString()}
            </div>
            {percentage !== null && (
              <p className="text-xs text-text">{percentage}% of total</p>
            )}
            {stat.title === 'Total' && stats.totalRequests > 0 && (
              <p className="text-xs text-text">All requests</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
