import type { UpdateSeparateQuotas } from '@root/schemas/quota/quota.schema'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import {
  invalidateQuotaData,
  type UserWithQuotaInfo,
} from '@/features/plex/hooks/usePlexUsers'
import {
  type QuotaEditStatus,
  QuotaFormSchema,
  type QuotaFormValues,
  transformQuotaFormToAPI,
} from '@/features/plex/quota/form-schema'
import { MIN_LOADING_DELAY } from '@/features/plex/store/constants'
import { apiErrorMessage, apiFetch } from '@/lib/tanstackApi'

interface SaveQuotaOptions {
  autoApproveHeld?: boolean
}

/**
 * React hook for managing user quota settings for movies and shows.
 *
 * Provides state and functions to save, update, delete, and retrieve user quota information, and to track the status of quota operations.
 *
 * @returns An object containing the current save status, a function to save or update quotas, a setter for save status, and a function to fetch a user's quota status.
 */
export function useQuotaManagement() {
  const [saveStatus, setSaveStatus] = useState<QuotaEditStatus>({
    type: 'idle',
  })

  const updateSeparateQuotas = useCallback(
    async (userId: number, quotaData: UpdateSeparateQuotas) => {
      const { data: result, error } = await apiFetch.PATCH(
        '/v1/quota/users/{userId}/separate',
        { params: { path: { userId } }, body: quotaData },
      )
      if (error) throw error

      return result.userQuotas
    },
    [],
  )

  const deleteQuota = useCallback(
    async (userId: number, autoApproveHeld = false) => {
      const { error } = await apiFetch.DELETE('/v1/quota/users/{userId}', {
        params: {
          path: { userId },
          query: autoApproveHeld ? { autoApproveHeld: 'true' } : undefined,
        },
      })
      if (error) throw error

      return true
    },
    [],
  )

  const getQuotaStatus = useCallback(async (userId: number) => {
    const { data: result, error } = await apiFetch.GET(
      '/v1/quota/users/{userId}/status',
      { params: { path: { userId } } },
    )
    if (error) throw error

    return result.quotaStatus
  }, [])

  const getPendingHeldCount = useCallback(async (userId: number) => {
    const { data: result, error } = await apiFetch.GET(
      '/v1/quota/users/{userId}/pending-held-count',
      { params: { path: { userId } } },
    )
    if (error) throw error

    return { movieCount: result.movieCount, showCount: result.showCount }
  }, [])

  const saveQuota = useCallback(
    async (
      user: UserWithQuotaInfo,
      formData: QuotaFormValues,
      options?: SaveQuotaOptions,
      onSuccess?: () => void,
    ) => {
      setSaveStatus({ type: 'loading' })

      try {
        // Transform the form data to ensure proper types
        const transformedData = QuotaFormSchema.parse(formData)
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, MIN_LOADING_DELAY),
        )

        const quotaOperation = async () => {
          const hasAnyQuota =
            transformedData.hasMovieQuota || transformedData.hasShowQuota

          if (!hasAnyQuota) {
            // Delete all existing quotas if user had any
            if (user.userQuotas?.movieQuota || user.userQuotas?.showQuota) {
              await deleteQuota(user.id, options?.autoApproveHeld)
              return 'All quotas removed successfully'
            }
            return 'No quotas to remove'
          }

          // Transform form data to API format using the utility function
          const separateQuotasData = transformQuotaFormToAPI(transformedData)
          if (options?.autoApproveHeld) {
            separateQuotasData.autoApproveHeld = true
          }
          await updateSeparateQuotas(user.id, separateQuotasData)
          return 'Quotas updated successfully'
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
        console.error('Error saving quota:', error)

        const errorMessage = apiErrorMessage(error) ?? 'Failed to save quota'
        setSaveStatus({ type: 'error', message: errorMessage })

        toast.error(errorMessage)

        await new Promise((resolve) => setTimeout(resolve, MIN_LOADING_DELAY))
        setSaveStatus({ type: 'idle' })
      }
    },
    [updateSeparateQuotas, deleteQuota],
  )

  return {
    saveStatus,
    saveQuota,
    setSaveStatus,
    getQuotaStatus,
    getPendingHeldCount,
  }
}
