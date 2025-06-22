import { useEffect, useRef } from 'react'
import { useApprovalsStore } from '@/features/plex/store/approvalsStore'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import ApprovalStatsHeader from './approval-stats-header'
import ApprovalFilters from './approval-filters'
import ApprovalRequestCard from './approval-request-card'

/**
 * Main approvals section component that manages the approval queue interface.
 *
 * Provides comprehensive approval management including statistics overview,
 * filtering capabilities, and the main approval request queue. Follows the
 * established patterns from Sonarr/Radarr sections with proper initialization
 * and loading state management.
 */
export default function ApprovalsSection() {
  const {
    approvalRequests,
    stats,
    isInitialized,
    approvalsLoading,
    error,
    total,
    currentQuery,
    initialize,
    refreshApprovalRequests,
    clearError,
  } = useApprovalsStore()

  const hasInitializedRef = useRef(false)

  useEffect(() => {
    if (!hasInitializedRef.current) {
      initialize(true)
      hasInitializedRef.current = true
    }
  }, [initialize])

  const handleRefresh = async () => {
    try {
      await refreshApprovalRequests()
    } catch (error) {
      console.error('Failed to refresh approval requests:', error)
    }
  }

  if (!isInitialized) {
    return null
  }

  if (approvalsLoading && approvalRequests.length === 0) {
    return (
      <div className="grid gap-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {['stat1', 'stat2', 'stat3', 'stat4'].map((stat) => (
              <div
                key={`stats-skeleton-${stat}`}
                className="h-20 bg-gray-200 dark:bg-gray-700 rounded"
              />
            ))}
          </div>
          <div className="space-y-4">
            {['header', 'body', 'footer'].map((section) => (
              <div
                key={`table-skeleton-${section}`}
                className="h-32 bg-gray-200 dark:bg-gray-700 rounded"
              />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-6">
      {/* Error banner */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-700 rounded-md p-4">
          <div className="flex justify-between items-center">
            <p className="text-red-800 dark:text-red-200">{error}</p>
            <Button variant="error" size="sm" onClick={clearError}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* Header with stats */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-text">Approval Management</h2>
        <div className="flex gap-2">
          <Button
            variant="neutral"
            size="sm"
            onClick={handleRefresh}
            disabled={approvalsLoading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${approvalsLoading ? 'animate-spin' : ''}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats overview */}
      <ApprovalStatsHeader stats={stats} loading={approvalsLoading} />

      {/* Filters */}
      <ApprovalFilters />

      {/* Results summary */}
      <div className="flex justify-between items-center text-sm text-gray-600 dark:text-gray-400">
        <span>
          Showing {approvalRequests.length} of {total} approval requests
          {currentQuery.status && (
            <span className="ml-1">(filtered by: {currentQuery.status})</span>
          )}
        </span>
        {currentQuery.limit && currentQuery.limit < total && (
          <span>
            Page{' '}
            {Math.floor((currentQuery.offset || 0) / currentQuery.limit) + 1} of{' '}
            {Math.ceil(total / currentQuery.limit)}
          </span>
        )}
      </div>

      {/* Approval requests list */}
      {approvalRequests.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <p className="text-lg mb-2">No approval requests found</p>
          <p className="text-sm">
            {currentQuery.status === 'pending'
              ? 'No pending approvals! All requests have been processed.'
              : currentQuery.status || Object.keys(currentQuery).length > 2
                ? 'Try adjusting your filters to see more results.'
                : 'No approval requests have been submitted yet.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {approvalRequests.map((request) => (
            <ApprovalRequestCard
              key={request.id}
              request={request}
              onUpdate={refreshApprovalRequests}
            />
          ))}
        </div>
      )}

      {/* Load more button if there are more results */}
      {total > approvalRequests.length && (
        <div className="text-center">
          <Button
            variant="neutral"
            onClick={() => {
              refreshApprovalRequests()
            }}
            disabled={approvalsLoading}
          >
            Load More ({total - approvalRequests.length} remaining)
          </Button>
        </div>
      )}
    </div>
  )
}
