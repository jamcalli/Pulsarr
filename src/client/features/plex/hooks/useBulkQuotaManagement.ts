import type { BulkQuotaOperation } from '@root/schemas/quota/quota.schema.js'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { invalidateQuotaData } from '@/features/plex/hooks/usePlexUsers'
import type {
  BulkQuotaFormData,
  QuotaEditStatus,
} from '@/features/plex/quota/form-schema'
import { MIN_LOADING_DELAY } from '@/features/plex/store/constants'
import type { PlexUserTableRow } from '@/features/plex/store/types'
import { apiErrorMessage, apiFetch } from '@/lib/tanstackApi'

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

function buildQuotaPayload(
  shouldSet: boolean,
  quotaType: BulkQuotaFormData['movieQuotaType'],
  quotaLimit: BulkQuotaFormData['movieQuotaLimit'],
  bypassApproval: boolean,
  hasWatchlistCap: boolean,
  watchlistCap: BulkQuotaFormData['movieWatchlistCap'],
): BulkQuotaOperation['movieQuota'] {
  if (shouldSet && quotaType && quotaLimit) {
    return {
      enabled: true,
      quotaType,
      quotaLimit,
      bypassApproval,
      watchlistCap: hasWatchlistCap ? watchlistCap : null,
    }
  }
  if (!shouldSet) {
    return { enabled: false }
  }
  return undefined
}

/**
 * React hook for performing bulk quota operations on multiple users, including clearing quotas or updating movie/show quota settings.
 *
 * Returns state and functions to execute bulk quota actions, manage operation status, and trigger UI feedback.
 *
 * @returns An object with the current save status, a function to perform bulk quota operations, and a setter for the save status.
 */
export function useBulkQuotaManagement() {
  const [saveStatus, setSaveStatus] = useState<QuotaEditStatus>({
    type: 'idle',
  })

  const deleteQuotas = useCallback(async (userIds: number[]) => {
    const { data: result, error } = await apiFetch.PATCH(
      '/v1/quota/users/bulk',
      { body: { userIds, operation: 'delete' as const } },
    )
    if (error) throw error

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

      bulkQuotaData.movieQuota = buildQuotaPayload(
        formData.setMovieQuota,
        formData.movieQuotaType,
        formData.movieQuotaLimit,
        formData.movieBypassApproval,
        formData.hasMovieWatchlistCap,
        formData.movieWatchlistCap,
      )
      bulkQuotaData.showQuota = buildQuotaPayload(
        formData.setShowQuota,
        formData.showQuotaType,
        formData.showQuotaLimit,
        formData.showBypassApproval,
        formData.hasShowWatchlistCap,
        formData.showWatchlistCap,
      )

      const { data: result, error } = await apiFetch.PATCH(
        '/v1/quota/users/bulk',
        { body: bulkQuotaData },
      )
      if (error) throw error

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

        await invalidateQuotaData()

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

        const errorMessage = apiErrorMessage(error) ?? 'Failed to update quotas'
        setSaveStatus({ type: 'error', message: errorMessage })

        toast.error(errorMessage)

        await new Promise((resolve) => setTimeout(resolve, MIN_LOADING_DELAY))
        setSaveStatus({ type: 'idle' })
      }
    },
    [deleteQuotas, updateBulkQuotas],
  )

  return {
    saveStatus,
    performBulkOperation,
    setSaveStatus,
  }
}
