import type {
  QuotaStatusGetResponse,
  UpdateSeparateQuotas,
  UserQuotaUpdateResponse,
} from '@root/schemas/quota/quota.schema'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import type { QuotaEditStatus } from '@/features/plex/components/user/quota-edit-modal'
import { MIN_LOADING_DELAY } from '@/features/plex/store/constants'
import type { UserWithQuotaInfo } from '@/stores/configStore'
import { useConfigStore } from '@/stores/configStore'

interface QuotaFormData {
  hasMovieQuota: boolean
  movieQuotaType?: 'daily' | 'weekly_rolling' | 'monthly'
  movieQuotaLimit?: number
  movieBypassApproval: boolean
  hasShowQuota: boolean
  showQuotaType?: 'daily' | 'weekly_rolling' | 'monthly'
  showQuotaLimit?: number
  showBypassApproval: boolean
}

/**
 * React hook for managing user quota settings for movies and shows.
 *
 * Provides state and functions to save, update, delete, and retrieve user quota information, and to track the status of quota operations.
 *
 * @returns An object containing the current save status, a function to save or update quotas, a setter for save status, and a function to fetch a user's quota status.
 */
export function useQuotaManagement() {
  const refreshQuotaData = useConfigStore((state) => state.refreshQuotaData)
  const [saveStatus, setSaveStatus] = useState<QuotaEditStatus>({
    type: 'idle',
  })

  const updateSeparateQuotas = useCallback(
    async (userId: number, quotaData: UpdateSeparateQuotas) => {
      const response = await fetch(`/v1/quota/users/${userId}/separate`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(quotaData),
      })

      if (!response.ok) {
        throw new Error(`Failed to update separate quotas: ${response.status}`)
      }

      const result: UserQuotaUpdateResponse = await response.json()
      if (!result.success) {
        throw new Error(result.message)
      }

      return result.userQuotas
    },
    [],
  )

  const deleteQuota = useCallback(async (userId: number) => {
    const response = await fetch(`/v1/quota/users/${userId}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      throw new Error(`Failed to delete quota: ${response.status}`)
    }

    const result = await response.json()
    if (!result.success) {
      throw new Error(result.message)
    }

    return true
  }, [])

  const getQuotaStatus = useCallback(async (userId: number) => {
    const response = await fetch(`/v1/quota/users/${userId}/status`)

    if (!response.ok) {
      throw new Error(`Failed to get quota status: ${response.status}`)
    }

    const result: QuotaStatusGetResponse = await response.json()
    if (!result.success) {
      throw new Error(result.message)
    }

    return result.quotaStatus
  }, [])

  const saveQuota = useCallback(
    async (
      user: UserWithQuotaInfo,
      formData: QuotaFormData,
      onSuccess?: () => void,
    ) => {
      setSaveStatus({ type: 'loading' })

      try {
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, MIN_LOADING_DELAY),
        )

        const quotaOperation = async () => {
          const hasAnyQuota = formData.hasMovieQuota || formData.hasShowQuota

          if (!hasAnyQuota) {
            // Delete all existing quotas if user had any
            if (user.userQuotas?.movieQuota || user.userQuotas?.showQuota) {
              await deleteQuota(user.id)
              return 'All quotas removed successfully'
            }
            return 'No quotas to remove'
          }

          // Use the new separate quotas API
          const separateQuotasData: UpdateSeparateQuotas = {}

          // Handle movie quota
          if (formData.hasMovieQuota) {
            if (!formData.movieQuotaType || !formData.movieQuotaLimit) {
              throw new Error('Movie quota type and limit are required')
            }

            separateQuotasData.movieQuota = {
              enabled: true,
              quotaType: formData.movieQuotaType,
              quotaLimit: formData.movieQuotaLimit,
              bypassApproval: formData.movieBypassApproval,
            }
          } else {
            separateQuotasData.movieQuota = {
              enabled: false,
            }
          }

          // Handle show quota
          if (formData.hasShowQuota) {
            if (!formData.showQuotaType || !formData.showQuotaLimit) {
              throw new Error('Show quota type and limit are required')
            }

            separateQuotasData.showQuota = {
              enabled: true,
              quotaType: formData.showQuotaType,
              quotaLimit: formData.showQuotaLimit,
              bypassApproval: formData.showBypassApproval,
            }
          } else {
            separateQuotasData.showQuota = {
              enabled: false,
            }
          }

          await updateSeparateQuotas(user.id, separateQuotasData)
          return 'Quotas updated successfully'
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
        console.error('Error saving quota:', error)

        const errorMessage =
          error instanceof Error ? error.message : 'Failed to save quota'
        setSaveStatus({ type: 'error', message: errorMessage })

        toast.error(errorMessage)

        await new Promise((resolve) => setTimeout(resolve, MIN_LOADING_DELAY))
        setSaveStatus({ type: 'idle' })
      }
    },
    [updateSeparateQuotas, deleteQuota, refreshQuotaData],
  )

  return {
    saveStatus,
    saveQuota,
    setSaveStatus,
    getQuotaStatus,
  }
}
