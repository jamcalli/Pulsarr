import { useState } from 'react'
import { toast } from 'sonner'
import { useConfigStore } from '@/stores/configStore'
import { MIN_LOADING_DELAY } from '@/features/plex/store/constants'
import type {
  PlexUserTableRow,
  PlexUserUpdates,
} from '@/features/plex/store/types'
import type { BulkUpdateRequest } from '@root/schemas/users/users.schema'

export type BulkUpdateStatus = 'idle' | 'loading' | 'success' | 'error'

/**
 * Manages state and provides handlers for bulk updating Plex user data, including modal visibility, update status, and selected user rows.
 *
 * Returns modal open state, a setter for modal visibility, the current update status, selected rows for editing, and functions to open the bulk edit modal and perform the bulk update operation.
 */
export function usePlexBulkUpdate() {
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

      const requestBody: BulkUpdateRequest = {
        userIds,
        updates,
      }

      const [response] = await Promise.all([
        fetch('/v1/users/bulk', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        }),
        minimumLoadingTime,
      ])

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to update users')
      }

      const result = await response.json()

      setUpdateStatus('success')
      toast.success(
        result.message || `Updated ${result.updatedCount} users successfully`,
      )

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
      toast.error(
        error instanceof Error ? error.message : 'Failed to update users',
      )
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
