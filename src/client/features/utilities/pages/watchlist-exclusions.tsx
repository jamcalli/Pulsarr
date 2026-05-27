import type { GetUserWatchlistResponse } from '@root/schemas/users/watchlist.schema'
import * as React from 'react'
import { toast } from 'sonner'
import { UtilitySectionHeader } from '@/components/ui/utility-section-header'
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
import {
  GLOBAL_USER_LABEL,
  type WatchlistExclusionTableRow,
} from '@/features/utilities/components/watchlist-exclusions/watchlist-exclusions-table-columns'
import {
  useCreateWatchlistExclusion,
  useRemoveWatchlistExclusion,
} from '@/features/utilities/hooks/useWatchlistExclusionMutations'
import { useWatchlistExclusions } from '@/features/utilities/hooks/useWatchlistExclusions'
import { useInitializeWithMinDuration } from '@/hooks/useInitializeWithMinDuration'
import { useUserOptions } from '@/hooks/useUserOptions'
import { api } from '@/lib/api'
import { useConfigStore } from '@/stores/configStore'

interface WatchlistItemWithUser {
  title: string
  key: string
  type: string
  status: string
  added: string | null
  guids: string[]
  userId: number
  username: string
}

export function WatchlistExclusionsPage() {
  const { isInitialized, initialize } = useConfigStore()
  const users = useConfigStore((state) => state.users)
  const { options: realUserOptions } = useUserOptions()
  const isInitializing = useInitializeWithMinDuration(initialize)

  const {
    data: exclusionsData,
    refetch: refetchExclusions,
    isLoading: exclusionsLoading,
  } = useWatchlistExclusions()
  const exclusions = exclusionsData?.exclusions ?? []

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
    type: string
    guids: string[]
    username: string
    status: string
  } | null>(null)
  const tableRef = React.useRef<WatchlistExclusionsTableRef>(null)
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
  const [unexcludeStatus, setUnexcludeStatus] =
    React.useState<BulkExclusionStatus>('idle')
  const [excludeStatus, setExcludeStatus] =
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
            guids: item.guids,
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
    const perUserExclusionByUserAndKey = new Map<
      string,
      (typeof exclusions)[number]
    >()
    const globalKeys = new Set<string>()
    for (const exclusion of exclusions) {
      if (exclusion.user_id === 0) {
        globalKeys.add(exclusion.key)
      } else {
        perUserExclusionByUserAndKey.set(
          `${exclusion.user_id}:${exclusion.key}`,
          exclusion,
        )
      }
    }

    const watchlistRows: WatchlistExclusionTableRow[] = watchlistItems.map(
      (item) => {
        const exclusion = perUserExclusionByUserAndKey.get(
          `${item.userId}:${item.key}`,
        )
        return {
          id: `wl-${item.userId}:${item.key}`,
          rowKind: 'watchlist',
          title: item.title,
          key: item.key,
          type: item.type,
          status: item.status,
          added: item.added,
          excluded_at: exclusion?.excluded_at ?? null,
          guids: item.guids,
          userId: item.userId,
          username: item.username,
          isExcluded: !!exclusion,
          exclusionId: exclusion?.id ?? null,
          isGloballyBlocked: globalKeys.has(item.key),
        }
      },
    )

    const matchedPerUserExclusionIds = new Set(
      watchlistRows
        .map((r) => r.exclusionId)
        .filter((id): id is number => id !== null),
    )

    const orphanRows: WatchlistExclusionTableRow[] = []
    for (const exclusion of exclusions) {
      if (exclusion.user_id === 0) {
        orphanRows.push({
          id: `excl-${exclusion.id}`,
          rowKind: 'global',
          title: exclusion.title,
          key: exclusion.key,
          type: exclusion.type,
          status: null,
          added: null,
          excluded_at: exclusion.excluded_at,
          guids: exclusion.guids,
          userId: 0,
          username: GLOBAL_USER_LABEL,
          isExcluded: true,
          exclusionId: exclusion.id,
          isGloballyBlocked: true,
        })
      } else if (!matchedPerUserExclusionIds.has(exclusion.id)) {
        orphanRows.push({
          id: `excl-${exclusion.id}`,
          rowKind: 'orphan-user',
          title: exclusion.title,
          key: exclusion.key,
          type: exclusion.type,
          status: null,
          added: null,
          excluded_at: exclusion.excluded_at,
          guids: exclusion.guids,
          userId: exclusion.user_id,
          username: exclusion.username,
          isExcluded: true,
          exclusionId: exclusion.id,
          isGloballyBlocked: globalKeys.has(exclusion.key),
        })
      }
    }

    return [...watchlistRows, ...orphanRows]
  }, [watchlistItems, exclusions])

  const userFilterOptions = React.useMemo(() => {
    const nonSystem = realUserOptions.filter((o) => o.value !== '0')
    return [...nonSystem, { label: GLOBAL_USER_LABEL, value: '0' }]
  }, [realUserOptions])

  const handleExclude = (row: WatchlistExclusionTableRow) => {
    if (row.rowKind !== 'watchlist' || row.isExcluded) return
    setPendingExclude({
      key: row.key,
      userId: row.userId,
      title: row.title,
      type: row.type,
      guids: row.guids,
      username: row.username,
      status: row.status ?? '',
    })
  }

  const handleRemove = (row: WatchlistExclusionTableRow) => {
    if (!row.isExcluded || row.exclusionId === null) return
    setPendingUnexclude({
      exclusionId: row.exclusionId,
      key: row.key,
      username: row.username,
    })
  }

  const handleConfirmExclude = async () => {
    if (!pendingExclude) return
    setExcludeStatus('loading')
    try {
      await createExclusionMutation.mutateAsync({
        key: pendingExclude.key,
        userIds: [pendingExclude.userId],
        title: pendingExclude.title,
        type: pendingExclude.type,
        guids: pendingExclude.guids,
      })
      setExcludeStatus('success')
      toast.success('Exclusion created successfully')
      setTimeout(() => {
        setPendingExclude(null)
        setExcludeStatus('idle')
      }, 1000)
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to create exclusion'
      toast.error(errorMessage)
      setExcludeStatus('idle')
    }
  }

  const handleConfirmUnexclude = async () => {
    if (!pendingUnexclude) return
    setUnexcludeStatus('loading')
    try {
      await removeExclusionMutation.mutateAsync(pendingUnexclude.exclusionId)
      setUnexcludeStatus('success')
      toast.success('Exclusion removed successfully')
      setTimeout(() => {
        setPendingUnexclude(null)
        setUnexcludeStatus('idle')
      }, 1000)
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to remove exclusion'
      toast.error(errorMessage)
      setUnexcludeStatus('idle')
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

  const handleBulkExcludeStart = (rows: WatchlistExclusionTableRow[]) => {
    setPendingBulk(rows)
    setBulkStatus('idle')
  }

  const handleBulkExclude = async (
    rows: WatchlistExclusionTableRow[],
    scope: BulkExclusionScope,
  ) => {
    if (rows.length === 0) return
    setBulkStatus('loading')

    const byKey = new Map<
      string,
      {
        title: string
        type: string
        guids: string[]
        userIds: Set<number>
      }
    >()
    for (const row of rows) {
      const userId = scope === 'global' ? 0 : row.userId
      const entry = byKey.get(row.key) ?? {
        title: row.title,
        type: row.type,
        guids: row.guids,
        userIds: new Set<number>(),
      }
      entry.userIds.add(userId)
      byKey.set(row.key, entry)
    }

    const results = await Promise.allSettled(
      Array.from(byKey.entries()).map(
        ([key, { title, type, guids, userIds }]) =>
          createExclusionMutation.mutateAsync({
            key,
            userIds: Array.from(userIds),
            title,
            type,
            guids,
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
    }, 1000)
    if (failures === 0) {
      toast.success('Bulk exclude complete')
    } else {
      toast.error(`Bulk exclude completed with ${failures} failure(s)`)
    }
  }

  const handleBulkRemoveStart = (rows: WatchlistExclusionTableRow[]) => {
    const ids = rows
      .map((r) => r.exclusionId)
      .filter((id): id is number => id !== null)
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
    tableRef.current?.clearSelection()
    setTimeout(() => {
      setPendingBulkRemove(null)
      setBulkRemoveStatus('idle')
    }, 1000)
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
    exclusionsLoading

  if (isInitialLoad) {
    return <WatchlistExclusionsSkeleton />
  }

  return (
    <>
      <WatchlistExclusionsDeleteConfirmationModal
        open={pendingUnexclude !== null}
        onOpenChange={(open) => {
          if (!open && unexcludeStatus !== 'loading') {
            setPendingUnexclude(null)
          }
        }}
        onConfirm={handleConfirmUnexclude}
        actionStatus={unexcludeStatus}
        username={pendingUnexclude?.username || ''}
      />

      <WatchlistExclusionsExcludeConfirmationModal
        open={pendingExclude !== null}
        onOpenChange={(open) => {
          if (!open && excludeStatus !== 'loading') {
            setPendingExclude(null)
          }
        }}
        onConfirm={handleConfirmExclude}
        actionStatus={excludeStatus}
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
        actionStatus={bulkRemoveStatus}
        count={pendingBulkRemove?.length ?? 0}
      />

      <div>
        <UtilitySectionHeader
          title="Watchlist Exclusions"
          description="Prevent specific watchlist items from being routed to Sonarr and Radarr"
          showStatus={false}
        />

        <div className="mt-6">
          <WatchlistExclusionsTable
            ref={tableRef}
            data={tableData}
            userFilterOptions={userFilterOptions}
            isRefreshing={isRefreshing}
            onRefresh={handleRefresh}
            onExclude={handleExclude}
            onRemove={handleRemove}
            createMutation={createExclusionMutation}
            removeMutation={removeExclusionMutation}
            onBulkExclude={handleBulkExcludeStart}
            onBulkRemove={handleBulkRemoveStart}
          />
        </div>
      </div>
    </>
  )
}

export default WatchlistExclusionsPage
