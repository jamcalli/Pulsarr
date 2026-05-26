import type { GetUserWatchlistResponse } from '@root/schemas/users/watchlist.schema'
import * as React from 'react'
import { toast } from 'sonner'
import { UtilitySectionHeader } from '@/components/ui/utility-section-header'
import {
  WatchlistExclusionsActiveTable,
  type WatchlistExclusionsActiveTableRef,
} from '@/features/utilities/components/watchlist-exclusions/watchlist-exclusions-active-table'
import {
  type BulkExclusionScope,
  type BulkExclusionStatus,
  WatchlistExclusionsBulkModal,
} from '@/features/utilities/components/watchlist-exclusions/watchlist-exclusions-bulk-modal'
import { WatchlistExclusionsBulkRemoveModal } from '@/features/utilities/components/watchlist-exclusions/watchlist-exclusions-bulk-remove-modal'
import { WatchlistExclusionsDeleteConfirmationModal } from '@/features/utilities/components/watchlist-exclusions/watchlist-exclusions-delete-confirmation-modal'
import { WatchlistExclusionsExcludeConfirmationModal } from '@/features/utilities/components/watchlist-exclusions/watchlist-exclusions-exclude-confirmation-modal'
import { WatchlistExclusionsSkeleton } from '@/features/utilities/components/watchlist-exclusions/watchlist-exclusions-skeleton'
import {
  WatchlistExclusionsTable,
  type WatchlistExclusionsTableRef,
} from '@/features/utilities/components/watchlist-exclusions/watchlist-exclusions-table'
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
  const tableRef = React.useRef<WatchlistExclusionsTableRef>(null)
  const activeTableRef = React.useRef<WatchlistExclusionsActiveTableRef | null>(
    null,
  )
  const [pendingBulk, setPendingBulk] = React.useState<
    WatchlistExclusionTableRow[] | null
  >(null)
  const [bulkStatus, setBulkStatus] =
    React.useState<BulkExclusionStatus>('idle')
  const [pendingBulkRemove, setPendingBulkRemove] = React.useState<
    number[] | null
  >(null)
  const [bulkRemoveStatus, setBulkRemoveStatus] =
    React.useState<BulkExclusionStatus>('idle')

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

  const globallyBlockedKeys = React.useMemo(
    () => new Set(exclusions.filter((e) => e.user_id === 0).map((e) => e.key)),
    [exclusions],
  )

  const keyToTitleMap = React.useMemo(
    () => new Map(watchlistItems.map((item) => [item.key, item.title])),
    [watchlistItems],
  )

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

  const handleBulkActions = (rows: WatchlistExclusionTableRow[]) => {
    setPendingBulk(rows)
    setBulkStatus('idle')
  }

  const handleBulkExclude = async (
    rows: WatchlistExclusionTableRow[],
    scope: BulkExclusionScope,
  ) => {
    if (rows.length === 0) return
    setBulkStatus('loading')

    const byKey = new Map<string, Set<number>>()
    for (const row of rows) {
      const userId = scope === 'global' ? 0 : row.userId
      const users = byKey.get(row.key) ?? new Set<number>()
      users.add(userId)
      byKey.set(row.key, users)
    }

    const results = await Promise.allSettled(
      Array.from(byKey.entries()).map(([key, userIds]) =>
        createExclusionMutation.mutateAsync({
          key,
          userIds: Array.from(userIds),
        }),
      ),
    )
    const failures = results.filter((r) => r.status === 'rejected').length
    setBulkStatus(failures === 0 ? 'success' : 'error')
    await refetchExclusions()
    tableRef.current?.clearSelection()
    setTimeout(() => {
      setPendingBulk(null)
      setBulkStatus('idle')
    }, 600)
    if (failures === 0) {
      toast.success('Bulk exclude complete')
    } else {
      toast.error(`Bulk exclude completed with ${failures} failure(s)`)
    }
  }

  const handleBulkRemove = (ids: number[]) => {
    if (ids.length === 0) return
    setPendingBulkRemove(ids)
    setBulkRemoveStatus('idle')
  }

  const handleConfirmBulkRemove = async () => {
    if (!pendingBulkRemove || pendingBulkRemove.length === 0) return
    setBulkRemoveStatus('loading')

    const results = await Promise.allSettled(
      pendingBulkRemove.map((id) => removeExclusionMutation.mutateAsync(id)),
    )
    const failures = results.filter((r) => r.status === 'rejected').length
    setBulkRemoveStatus(failures === 0 ? 'success' : 'error')
    await refetchExclusions()
    activeTableRef.current?.clearSelection()
    setPendingBulkRemove(null)
    setBulkRemoveStatus('idle')
    if (failures === 0) {
      toast.success('Bulk remove complete')
    } else {
      toast.error(`Bulk remove completed with ${failures} failure(s)`)
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

      <WatchlistExclusionsBulkModal
        open={pendingBulk !== null}
        onOpenChange={(open) => {
          if (!open && bulkStatus !== 'loading') setPendingBulk(null)
        }}
        selectedRows={pendingBulk ?? []}
        onBulkExclude={handleBulkExclude}
        actionStatus={bulkStatus}
      />

      <WatchlistExclusionsBulkRemoveModal
        open={pendingBulkRemove !== null}
        onOpenChange={(open) => {
          if (!open && bulkRemoveStatus !== 'loading') {
            setPendingBulkRemove(null)
          }
        }}
        onConfirm={handleConfirmBulkRemove}
        isSubmitting={bulkRemoveStatus === 'loading'}
        count={pendingBulkRemove?.length ?? 0}
      />

      <div>
        <UtilitySectionHeader
          title="Watchlist Exclusions"
          description="Prevent specific watchlist items from being routed to Sonarr and Radarr"
          showStatus={false}
        />

        <div className="mt-6 space-y-6">
          <div>
            <h3 className="font-medium text-foreground mb-2">Watchlists</h3>
            <WatchlistExclusionsTable
              ref={tableRef}
              data={tableData}
              userFilterOptions={userFilterOptions}
              isRefreshing={isRefreshing}
              onRefresh={handleRefresh}
              onExclude={handleExclude}
              createMutation={createExclusionMutation}
              onBulkActions={handleBulkActions}
              globallyBlockedKeys={globallyBlockedKeys}
            />
          </div>

          <div>
            <h3 className="font-medium text-foreground mb-2">
              Active Exclusions
            </h3>
            <WatchlistExclusionsActiveTable
              exclusions={exclusions}
              keyToTitleMap={keyToTitleMap}
              onRemove={(entry) => setPendingUnexclude(entry)}
              onBulkRemove={handleBulkRemove}
              removeMutation={removeExclusionMutation}
              selectionRef={activeTableRef}
            />
          </div>
        </div>
      </div>
    </>
  )
}

export default WatchlistExclusionsPage
