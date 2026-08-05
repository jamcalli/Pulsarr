import type { BulkUpdateRequest } from '@root/schemas/users/users.schema'
import { useState } from 'react'
import { toast } from 'sonner'
import { invalidateUserData } from '@/features/plex/hooks/usePlexUsers'
import { MIN_LOADING_DELAY } from '@/features/plex/store/constants'
import type {
  PlexUserTableRow,
  PlexUserUpdates,
} from '@/features/plex/store/types'
import { apiErrorMessage, apiFetch } from '@/lib/tanstackApi'

export type BulkUpdateStatus = 'idle' | 'loading' | 'success' | 'error'

/**
 * Provides state and handler functions for performing bulk updates of Plex user data, including managing modal visibility, update status, and selected user rows.
 *
 * Returns the current modal open state, a setter for modal visibility, the current update status, selected rows for editing, and functions to open the bulk edit modal and execute the bulk update operation.
 */
export function usePlexBulkUpdate() {
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

      const [{ data: result, error: fetchError }] = await Promise.all([
        apiFetch.PATCH('/v1/users/bulk', { body: requestBody }),
        minimumLoadingTime,
      ])
      if (fetchError) throw fetchError

      setUpdateStatus('success')
      toast.success(
        result.message || `Updated ${result.updatedCount} users successfully`,
      )

      // Refresh user data
      await invalidateUserData()

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
      toast.error(apiErrorMessage(error) ?? 'Failed to update users')
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
