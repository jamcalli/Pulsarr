import { useState } from 'react'
import { useToast } from '@/hooks/use-toast'
import { useConfigStore } from '@/stores/configStore'
import { MIN_LOADING_DELAY } from '@/features/plex/store/constants'
import type {
  PlexUserTableRow,
  PlexUserUpdates,
} from '@/features/plex/store/types'

export type BulkUpdateStatus = 'idle' | 'loading' | 'success' | 'error'

export function usePlexBulkUpdate() {
  const { toast } = useToast()
  const fetchUserData = useConfigStore((state) => state.fetchUserData)
  const [bulkEditModalOpen, setBulkEditModalOpen] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<BulkUpdateStatus>('idle')
  const [selectedRows, setSelectedRows] = useState<PlexUserTableRow[]>([])

  const handleOpenBulkEditModal = (rows: PlexUserTableRow[]) => {
    setSelectedRows(rows)
    setBulkEditModalOpen(true)
  }

  const handleBulkUpdate = async (
    userIds: number[],
    updates: PlexUserUpdates,
  ) => {
    setUpdateStatus('loading')
    try {
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, MIN_LOADING_DELAY),
      )

      const [response] = await Promise.all([
        fetch('/v1/users/bulk', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userIds,
            updates,
          }),
        }),
        minimumLoadingTime,
      ])

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to update users')
      }

      const result = await response.json()

      setUpdateStatus('success')
      toast({
        description:
          result.message || `Updated ${result.updatedCount} users successfully`,
        variant: 'default',
      })

      // Refresh user data
      await fetchUserData()

      // Show success state then close
      await new Promise((resolve) => setTimeout(resolve, MIN_LOADING_DELAY / 2))
      setBulkEditModalOpen(false)

      // Reset status
      setTimeout(() => {
        setUpdateStatus('idle')
      }, 500)
    } catch (error) {
      console.error('Bulk update error:', error)
      setUpdateStatus('error')
      toast({
        description:
          error instanceof Error ? error.message : 'Failed to update users',
        variant: 'destructive',
      })
      await new Promise((resolve) => setTimeout(resolve, MIN_LOADING_DELAY))
      setUpdateStatus('idle')
    }
  }

  return {
    bulkEditModalOpen,
    setBulkEditModalOpen,
    updateStatus,
    selectedRows,
    handleOpenBulkEditModal,
    handleBulkUpdate,
  }
}
