import { useState } from 'react'
import { useToast } from '@/hooks/use-toast'
import { useConfigStore } from '@/stores/configStore'

// Import the type directly from configStore instead of redefining it
import type { UserWatchlistInfo } from '@/stores/configStore'

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

  const handleEditUser = (user: UserWatchlistInfo) => {
    setSelectedUser(user)
    setIsEditModalOpen(true)
  }

  const handleUpdateUser = async (
    userId: string,
    updates: Partial<UserWatchlistInfo>,
  ) => {
    setSaveStatus('loading')
    try {
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, 500),
      )

      await Promise.all([updateUser(userId, updates), minimumLoadingTime])

      setSaveStatus('success')
      toast({
        description: 'User information updated successfully',
        variant: 'default',
      })

      // Show success state then close
      await new Promise((resolve) => setTimeout(resolve, 300))
      setIsEditModalOpen(false)
    } catch (error) {
      console.error('Update error:', error)
      setSaveStatus('error')
      toast({
        description:
          error instanceof Error ? error.message : 'Failed to update user',
        variant: 'destructive',
      })
      await new Promise((resolve) => setTimeout(resolve, 1000))
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
    handleEditUser,
    handleUpdateUser,
  }
}
