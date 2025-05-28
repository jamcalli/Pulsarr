import { useState, useEffect } from 'react'
import { useToast } from '@/hooks/use-toast'
import { useConfigStore } from '@/stores/configStore'
import { MIN_LOADING_DELAY } from '@/features/plex/store/constants'
import type { UserWatchlistInfo } from '@/stores/configStore'
import type { UpdateUser } from '@root/schemas/users/users.schema'

export type UserStatus = 'idle' | 'loading' | 'success' | 'error'

export function usePlexUser() {
  const { toast } = useToast()
  const users = useConfigStore((state) => state.users)
  const updateUser = useConfigStore((state) => state.updateUser)
  const [selectedUser, setSelectedUser] = useState<UserWatchlistInfo | null>(
    null,
  )
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [saveStatus, setSaveStatus] = useState<UserStatus>('idle')
  const [isLoading, setIsLoading] = useState(true)
  const isInitialized = useConfigStore((state) => state.isInitialized)

  useEffect(() => {
    if (isInitialized) {
      const timer = setTimeout(() => {
        setIsLoading(false)
      }, MIN_LOADING_DELAY)

      return () => clearTimeout(timer)
    }
  }, [isInitialized])

  const handleEditUser = (user: UserWatchlistInfo) => {
    setSelectedUser(user)
    setSaveStatus('idle')
    setIsEditModalOpen(true)
  }

  const handleUpdateUser = async (userId: string, updates: UpdateUser) => {
    setSaveStatus('loading')
    try {
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, MIN_LOADING_DELAY),
      )

      // Convert UpdateUser to Partial<UserWatchlistInfo> to match the expected type
      const compatibleUpdates: Partial<UserWatchlistInfo> = {
        ...(updates.name !== undefined && { name: updates.name }),
        ...(updates.apprise !== undefined && {
          apprise: updates.apprise === null ? undefined : updates.apprise,
        }),
        ...(updates.alias !== undefined && { alias: updates.alias }),
        ...(updates.discord_id !== undefined && {
          discord_id: updates.discord_id,
        }),
        ...(updates.notify_apprise !== undefined && {
          notify_apprise: updates.notify_apprise,
        }),
        ...(updates.notify_discord !== undefined && {
          notify_discord: updates.notify_discord,
        }),
        ...(updates.notify_tautulli !== undefined && {
          notify_tautulli: updates.notify_tautulli,
        }),
        ...(updates.can_sync !== undefined && { can_sync: updates.can_sync }),
      }

      await Promise.all([
        updateUser(userId, compatibleUpdates),
        minimumLoadingTime,
      ])

      setSaveStatus('success')
      toast({
        description: 'User information updated successfully',
        variant: 'default',
      })

      // Show success state then close
      await new Promise((resolve) => setTimeout(resolve, MIN_LOADING_DELAY / 2))
      setIsEditModalOpen(false)
    } catch (error) {
      console.error('Update error:', error)
      setSaveStatus('error')
      toast({
        description:
          error instanceof Error ? error.message : 'Failed to update user',
        variant: 'destructive',
      })
      await new Promise((resolve) => setTimeout(resolve, MIN_LOADING_DELAY))
      setSaveStatus('idle')
    }
  }

  return {
    users,
    selectedUser,
    setSelectedUser,
    isEditModalOpen,
    setIsEditModalOpen,
    saveStatus,
    setSaveStatus,
    isLoading,
    handleEditUser,
    handleUpdateUser,
  }
}
