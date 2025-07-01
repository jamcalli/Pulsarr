import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { MIN_LOADING_DELAY } from '@/features/plex/store/constants'
import { useConfigStore } from '@/stores/configStore'
import type { BulkQuotaEditStatus } from '@/features/plex/components/user/bulk-quota-edit-modal'
import type { PlexUserTableRow } from '@/features/plex/store/types'
import type { BulkQuotaOperation } from '@root/schemas/quota/quota.schema.js'

export interface BulkQuotaFormData {
  clearQuotas: boolean
  setMovieQuota: boolean
  movieQuotaType?: 'daily' | 'weekly_rolling' | 'monthly'
  movieQuotaLimit?: number
  movieBypassApproval: boolean
  setShowQuota: boolean
  showQuotaType?: 'daily' | 'weekly_rolling' | 'monthly'
  showQuotaLimit?: number
  showBypassApproval: boolean
}

/**
 * Helper function to format success messages for bulk quota operations.
 *
 * @param successful - Array of successful user IDs
 * @param failed - Array of failed user IDs
 * @param action - The action performed (e.g., 'cleared', 'updated')
 * @returns Formatted success message
 */
const formatSuccessMessage = (
  successful: number[],
  failed: number[],
  action: string,
) => {
  const userText = successful.length !== 1 ? 'users' : 'user'
  const baseMessage = `Quotas ${action} for ${successful.length} ${userText}`
  return failed.length > 0
    ? `${baseMessage} (${failed.length} failed)`
    : baseMessage
}

/**
 * React hook for performing bulk quota operations on multiple users, including clearing quotas or updating movie/show quota settings.
 *
 * Returns state and functions to execute bulk quota actions, manage operation status, and trigger UI feedback.
 *
 * @returns An object with the current save status, a function to perform bulk quota operations, and a setter for the save status.
 */
export function useBulkQuotaManagement() {
  const refreshQuotaData = useConfigStore((state) => state.refreshQuotaData)
  const [saveStatus, setSaveStatus] = useState<BulkQuotaEditStatus>({
    type: 'idle',
  })

  const deleteQuotas = useCallback(async (userIds: number[]) => {
    const response = await fetch('/v1/quota/users/bulk', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userIds,
        operation: 'delete',
      }),
    })

    if (!response.ok) {
      throw new Error(`Bulk delete operation failed: ${response.status}`)
    }

    const result = await response.json()
    if (!result.success) {
      throw new Error(result.message)
    }

    return {
      successful: userIds.filter((id) => !result.failedIds?.includes(id)),
      failed: result.failedIds || [],
    }
  }, [])

  const updateBulkQuotas = useCallback(
    async (userIds: number[], formData: BulkQuotaFormData) => {
      const bulkQuotaData: BulkQuotaOperation = {
        userIds,
        operation: 'update',
      }

      // Handle movie quota
      if (
        formData.setMovieQuota &&
        formData.movieQuotaType &&
        formData.movieQuotaLimit
      ) {
        bulkQuotaData.movieQuota = {
          enabled: true,
          quotaType: formData.movieQuotaType,
          quotaLimit: formData.movieQuotaLimit,
          bypassApproval: formData.movieBypassApproval,
        }
      } else if (!formData.setMovieQuota) {
        bulkQuotaData.movieQuota = {
          enabled: false,
        }
      }

      // Handle show quota
      if (
        formData.setShowQuota &&
        formData.showQuotaType &&
        formData.showQuotaLimit
      ) {
        bulkQuotaData.showQuota = {
          enabled: true,
          quotaType: formData.showQuotaType,
          quotaLimit: formData.showQuotaLimit,
          bypassApproval: formData.showBypassApproval,
        }
      } else if (!formData.setShowQuota) {
        bulkQuotaData.showQuota = {
          enabled: false,
        }
      }

      const response = await fetch('/v1/quota/users/bulk', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bulkQuotaData),
      })

      if (!response.ok) {
        throw new Error(`Bulk update operation failed: ${response.status}`)
      }

      const result = await response.json()
      if (!result.success) {
        throw new Error(result.message)
      }

      return {
        successful: userIds.filter((id) => !result.failedIds?.includes(id)),
        failed: result.failedIds || [],
      }
    },
    [],
  )

  const performBulkOperation = useCallback(
    async (
      selectedRows: PlexUserTableRow[],
      formData: BulkQuotaFormData,
      onSuccess?: () => void,
    ) => {
      setSaveStatus({ type: 'loading' })

      try {
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, MIN_LOADING_DELAY),
        )

        const quotaOperation = async () => {
          const userIds = selectedRows.map((row) => row.original.id)

          if (formData.clearQuotas) {
            // Clear all quotas for selected users
            const { successful, failed } = await deleteQuotas(userIds)

            if (failed.length > 0) {
              console.error('Some quota deletions failed:', failed)
            }

            return formatSuccessMessage(successful, failed, 'cleared')
          }

          // Update quotas for selected users
          const { successful, failed } = await updateBulkQuotas(
            userIds,
            formData,
          )

          if (failed.length > 0) {
            console.error('Some quota updates failed:', failed)
          }

          return formatSuccessMessage(successful, failed, 'updated')
        }

        const [message] = await Promise.all([
          quotaOperation(),
          minimumLoadingTime,
        ])

        // Refresh quota data from the store
        await refreshQuotaData()

        setSaveStatus({
          type: 'success',
          message,
        })

        toast.success(message)

        // Show success state then close
        await new Promise((resolve) =>
          setTimeout(resolve, MIN_LOADING_DELAY / 2),
        )
        onSuccess?.()
      } catch (error) {
        console.error('Error performing bulk quota operation:', error)

        const errorMessage =
          error instanceof Error ? error.message : 'Failed to update quotas'
        setSaveStatus({ type: 'error', message: errorMessage })

        toast.error(errorMessage)

        await new Promise((resolve) => setTimeout(resolve, MIN_LOADING_DELAY))
        setSaveStatus({ type: 'idle' })
      }
    },
    [deleteQuotas, updateBulkQuotas, refreshQuotaData],
  )

  return {
    saveStatus,
    performBulkOperation,
    setSaveStatus,
  }
}
