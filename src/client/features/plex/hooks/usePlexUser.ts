import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { useConfigStore } from '@/stores/configStore'
import { MIN_LOADING_DELAY } from '@/features/plex/store/constants'
import type { UserWatchlistInfo } from '@/stores/configStore'
import type { CreateUser } from '@root/schemas/users/users.schema'

export type UserStatus = 'idle' | 'loading' | 'success' | 'error'

/**
 * React hook that manages Plex user data, edit modal state, save status, loading state, and user update operations.
 *
 * Provides access to user data, controls for selecting and editing users, modal visibility, save status, and loading state. Includes handler functions for initiating user edits and updating user information, with enforced minimum loading delays and toast notifications for update outcomes.
 *
 * @returns An object containing user data, selected user state and setter, modal visibility controls, save status and setter, loading state, and handler functions for editing and updating users.
 */
export function usePlexUser() {
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

  const handleUpdateUser = async (userId: number, updates: CreateUser) => {
    setSaveStatus('loading')
    try {
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, MIN_LOADING_DELAY),
      )

      await Promise.all([updateUser(userId, updates), minimumLoadingTime])

      setSaveStatus('success')
      toast.success('User information updated successfully')

      // Show success state then close
      await new Promise((resolve) => setTimeout(resolve, MIN_LOADING_DELAY / 2))
      setIsEditModalOpen(false)
    } catch (error) {
      console.error('Update error:', error)
      setSaveStatus('error')
      toast.error(
        error instanceof Error ? error.message : 'Failed to update user',
      )
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
