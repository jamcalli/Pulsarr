import { useState, useEffect } from 'react'
import { useToast } from '@/hooks/use-toast'
import { useConfigStore } from '@/stores/configStore'
import { MIN_LOADING_DELAY } from '@/features/plex/store/constants'
import type { UserWatchlistInfo } from '@/stores/configStore'
import type { CreateUser } from '@root/schemas/users/users.schema'

export type UserStatus = 'idle' | 'loading' | 'success' | 'error'

/**
 * React hook for managing Plex user data, editing state, and update operations.
 *
 * Provides access to the list of users, selected user state, modal visibility, save status, loading state, and handlers for editing and updating user information. Ensures a minimum loading delay for smoother UI transitions and displays toast notifications on update success or failure.
 *
 * @returns An object containing user data, editing state, and handler functions for user management in Plex-related components.
 */
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

  const handleUpdateUser = async (userId: string, updates: CreateUser) => {
    setSaveStatus('loading')
    try {
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, MIN_LOADING_DELAY),
      )

      await Promise.all([updateUser(userId, updates), minimumLoadingTime])

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
