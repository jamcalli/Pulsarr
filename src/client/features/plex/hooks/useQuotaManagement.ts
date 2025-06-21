import { useState, useCallback } from 'react'
import { toast } from '@/hooks/use-toast'
import { MIN_LOADING_DELAY } from '@/features/plex/store/constants'
import { useConfigStore } from '@/stores/configStore'
import type { QuotaEditStatus } from '@/features/plex/components/user/quota-edit-modal'
import type { UserWithQuotaInfo } from '@/stores/configStore'
import type {
  CreateUserQuota,
  UpdateUserQuota,
  UserQuotaCreateResponse,
  UserQuotaUpdateResponse,
  QuotaStatusGetResponse,
} from '@root/schemas/quota/quota.schema'

interface QuotaFormData {
  hasQuota: boolean
  quotaType?: 'daily' | 'weekly_rolling' | 'monthly'
  quotaLimit?: number
  bypassApproval: boolean
}

export function useQuotaManagement() {
  const refreshQuotaData = useConfigStore((state) => state.refreshQuotaData)
  const [saveStatus, setSaveStatus] = useState<QuotaEditStatus>({
    type: 'idle',
  })

  const createQuota = useCallback(
    async (_userId: number, quotaData: CreateUserQuota) => {
      const response = await fetch('/v1/quota/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(quotaData),
      })

      if (!response.ok) {
        throw new Error(`Failed to create quota: ${response.status}`)
      }

      const result: UserQuotaCreateResponse = await response.json()
      if (!result.success) {
        throw new Error(result.message)
      }

      return result.userQuota
    },
    [],
  )

  const updateQuota = useCallback(
    async (userId: number, quotaData: UpdateUserQuota) => {
      const response = await fetch(`/v1/quota/users/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(quotaData),
      })

      if (!response.ok) {
        throw new Error(`Failed to update quota: ${response.status}`)
      }

      const result: UserQuotaUpdateResponse = await response.json()
      if (!result.success) {
        throw new Error(result.message)
      }

      return result.userQuota
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
          if (!formData.hasQuota) {
            // Delete existing quota if user had one
            if (user.quotaStatus) {
              await deleteQuota(user.id)
              return 'Quota removed successfully'
            }
            return 'No quota to remove'
          }

          // Validate required fields when hasQuota is true
          if (!formData.quotaType || !formData.quotaLimit) {
            throw new Error('Quota type and limit are required')
          }

          const quotaData = {
            quotaType: formData.quotaType,
            quotaLimit: formData.quotaLimit,
            bypassApproval: formData.bypassApproval,
          }

          if (user.quotaStatus) {
            // Update existing quota
            await updateQuota(user.id, quotaData)
            return 'Quota updated successfully'
          }
          // Create new quota
          await createQuota(user.id, {
            userId: user.id,
            ...quotaData,
          })
          return 'Quota created successfully'
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

        toast({
          description: message,
          variant: 'default',
        })

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

        toast({
          description: errorMessage,
          variant: 'destructive',
        })

        await new Promise((resolve) => setTimeout(resolve, MIN_LOADING_DELAY))
        setSaveStatus({ type: 'idle' })
      }
    },
    [createQuota, updateQuota, deleteQuota, refreshQuotaData],
  )

  return {
    saveStatus,
    saveQuota,
    setSaveStatus,
    getQuotaStatus,
  }
}
