import type { GetUserWatchlistResponse } from '@root/schemas/users/watchlist.schema'
import * as React from 'react'
import { toast } from 'sonner'
import { UtilitySectionHeader } from '@/components/ui/utility-section-header'
import { WatchlistExclusionsDeleteConfirmationModal } from '@/features/utilities/components/watchlist-exclusions/watchlist-exclusions-delete-confirmation-modal'
import { WatchlistExclusionsExcludeConfirmationModal } from '@/features/utilities/components/watchlist-exclusions/watchlist-exclusions-exclude-confirmation-modal'
import { WatchlistExclusionsSkeleton } from '@/features/utilities/components/watchlist-exclusions/watchlist-exclusions-skeleton'
import { WatchlistExclusionsTable } from '@/features/utilities/components/watchlist-exclusions/watchlist-exclusions-table'
import type { WatchlistExclusionTableRow } from '@/features/utilities/components/watchlist-exclusions/watchlist-exclusions-table-columns'
import {
  useCreateWatchlistExclusion,
  useRemoveWatchlistExclusion,
} from '@/features/utilities/hooks/useWatchlistExclusionMutations'
import { useWatchlistExclusions } from '@/features/utilities/hooks/useWatchlistExclusions'
import { useInitializeWithMinDuration } from '@/hooks/useInitializeWithMinDuration'
import { api } from '@/lib/api'
import { useConfigStore } from '@/stores/configStore'

interface WatchlistItemWithUser {
  title: string
  key: string
  type: string
  status: string
  added: string | null
  userId: number
  username: string
}

export function WatchlistExclusionsPage() {
  const { isInitialized, initialize } = useConfigStore()
  const users = useConfigStore((state) => state.users)
  const isInitializing = useInitializeWithMinDuration(initialize)

  const { data: exclusionsData, refetch: refetchExclusions } =
    useWatchlistExclusions()
  const exclusions = exclusionsData?.exclusions ?? []
  const hasLoadedExclusions = exclusionsData !== undefined

  const createExclusionMutation = useCreateWatchlistExclusion()
  const removeExclusionMutation = useRemoveWatchlistExclusion()

  const [watchlistItems, setWatchlistItems] = React.useState<
    WatchlistItemWithUser[]
  >([])
  const [hasLoadedWatchlists, setHasLoadedWatchlists] = React.useState(false)
  const [isRefreshing, setIsRefreshing] = React.useState(false)
  const [pendingUnexclude, setPendingUnexclude] = React.useState<{
    exclusionId: number
    key: string
    username: string
  } | null>(null)
  const [pendingExclude, setPendingExclude] = React.useState<{
    key: string
    userId: number
    title: string
    username: string
    status: string
  } | null>(null)

  const fetchAllWatchlistItems = React.useCallback(async () => {
    if (!users?.length) {
      setWatchlistItems([])
      setHasLoadedWatchlists(true)
      return
    }

    const usersWithItems = users.filter((u) => u.watchlist_count > 0)
    const results = await Promise.all(
      usersWithItems.map(async (user) => {
        try {
          const response = await fetch(api(`/v1/users/${user.id}/watchlist`))
          if (!response.ok) return []
          const data: GetUserWatchlistResponse = await response.json()
          return data.data.watchlistItems.map((item) => ({
            title: item.title,
            key: item.key,
            type: item.type,
            status: item.status,
            added: item.added,
            userId: user.id,
            username: user.name,
          }))
        } catch {
          return []
        }
      }),
    )
    setWatchlistItems(results.flat())
    setHasLoadedWatchlists(true)
  }, [users])

  React.useEffect(() => {
    if (isInitialized && !hasLoadedWatchlists) {
      fetchAllWatchlistItems()
    }
  }, [isInitialized, hasLoadedWatchlists, fetchAllWatchlistItems])

  const tableData = React.useMemo<WatchlistExclusionTableRow[]>(() => {
    return watchlistItems.map((item) => {
      const exclusion = exclusions.find(
        (e) => e.key === item.key && e.user_id === item.userId,
      )
      return {
        ...item,
        id: `${item.userId}-${item.key}`,
        isExcluded: !!exclusion,
        exclusionId: exclusion?.id ?? null,
      }
    })
  }, [watchlistItems, exclusions])

  const userFilterOptions = React.useMemo(() => {
    const uniqueUsers = new Map(
      watchlistItems.map((item) => [item.userId, item.username]),
    )
    return Array.from(uniqueUsers.values()).map((name) => ({
      label: name,
      value: name,
    }))
  }, [watchlistItems])

  const handleExclude = (row: WatchlistExclusionTableRow) => {
    setPendingExclude({
      key: row.key,
      userId: row.userId,
      title: row.title,
      username: row.username,
      status: row.status,
    })
  }

  const handleConfirmExclude = async () => {
    if (!pendingExclude) return
    try {
      await createExclusionMutation.mutateAsync({
        key: pendingExclude.key,
        userIds: [pendingExclude.userId],
      })
      toast.success('Exclusion created successfully')
      setPendingExclude(null)
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to create exclusion'
      toast.error(errorMessage)
    }
  }

  const handleUnexclude = (row: WatchlistExclusionTableRow) => {
    if (row.exclusionId) {
      setPendingUnexclude({
        exclusionId: row.exclusionId,
        key: row.key,
        username: row.username,
      })
    }
  }

  const handleConfirmUnexclude = async () => {
    if (!pendingUnexclude) return
    try {
      await removeExclusionMutation.mutateAsync(pendingUnexclude.exclusionId)
      toast.success('Exclusion removed successfully')
      setPendingUnexclude(null)
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to remove exclusion'
      toast.error(errorMessage)
    }
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await Promise.all([fetchAllWatchlistItems(), refetchExclusions()])
    } catch {
      toast.error('Failed to refresh data')
    } finally {
      setIsRefreshing(false)
    }
  }

  const isInitialLoad =
    isInitializing ||
    !isInitialized ||
    !hasLoadedWatchlists ||
    !hasLoadedExclusions

  if (isInitialLoad) {
    return <WatchlistExclusionsSkeleton />
  }

  return (
    <>
      <WatchlistExclusionsDeleteConfirmationModal
        open={pendingUnexclude !== null}
        onOpenChange={(open) => !open && setPendingUnexclude(null)}
        onConfirm={handleConfirmUnexclude}
        isSubmitting={
          pendingUnexclude !== null &&
          removeExclusionMutation.variables === pendingUnexclude.exclusionId &&
          removeExclusionMutation.isPending
        }
        username={pendingUnexclude?.username || ''}
      />

      <WatchlistExclusionsExcludeConfirmationModal
        open={pendingExclude !== null}
        onOpenChange={(open) => !open && setPendingExclude(null)}
        onConfirm={handleConfirmExclude}
        isSubmitting={
          pendingExclude !== null &&
          createExclusionMutation.isPending &&
          createExclusionMutation.variables?.key === pendingExclude.key &&
          createExclusionMutation.variables?.userIds.includes(
            pendingExclude.userId,
          )
        }
        title={pendingExclude?.title || ''}
        username={pendingExclude?.username || ''}
        status={pendingExclude?.status || ''}
      />

      <div>
        <UtilitySectionHeader
          title="Watchlist Exclusions"
          description="Prevent specific watchlist items from being routed to Sonarr and Radarr"
          showStatus={false}
        />

        <div className="grid gap-4">
          <WatchlistExclusionsTable
            data={tableData}
            userFilterOptions={userFilterOptions}
            isRefreshing={isRefreshing}
            onRefresh={handleRefresh}
            onExclude={handleExclude}
            onUnexclude={handleUnexclude}
            createMutation={createExclusionMutation}
            removeMutation={removeExclusionMutation}
          />
        </div>
      </div>
    </>
  )
}

export default WatchlistExclusionsPage
