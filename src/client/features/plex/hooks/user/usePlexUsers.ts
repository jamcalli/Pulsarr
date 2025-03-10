import { useState, useCallback } from 'react'
import { useToast } from '@/hooks/use-toast'
import { usePlexStore } from '@/features/plex/store/plexStore'
import { MIN_LOADING_DELAY } from '@/features/plex/store/constants'
import type { UserListWithCountsResponse } from '@root/schemas/users/users-list.schema';

type PlexUserType = UserListWithCountsResponse['users'][0];

export function usePlexUsers() {
  const { toast } = useToast()
  const [isUpdating, setIsUpdating] = useState(false)
  const [selectedUser, setSelectedUser] = useState<PlexUserType | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  
  const users = usePlexStore((state) => state.users || [])
  const selfWatchlistInfo = usePlexStore((state) => state.selfWatchlistInfo)
  const othersWatchlistInfo = usePlexStore((state) => state.othersWatchlistInfo)
  const updateUser = usePlexStore((state) => state.updateUser)
  
  const handleEditUser = useCallback((user: PlexUserType) => {
    setSelectedUser(user)
    setIsEditModalOpen(true)
  }, [])
  
  const handleUpdateUser = useCallback(async (
    userId: number, 
    updates: Partial<PlexUserType>
  ) => {
    setIsUpdating(true)
    try {
      const minimumLoadingTime = new Promise((resolve) => 
        setTimeout(resolve, MIN_LOADING_DELAY)
      )
      
      await Promise.all([
        updateUser(userId, updates),
        minimumLoadingTime,
      ])
      
      toast({
        description: 'User information updated successfully',
        variant: 'default',
      })
      
      // Close modal after success
      setIsEditModalOpen(false)
      return true
    } catch (error) {
      console.error('User update error:', error)
      toast({
        description: error instanceof Error ? error.message : 'Failed to update user',
        variant: 'destructive',
      })
      return false
    } finally {
      setIsUpdating(false)
    }
  }, [updateUser, toast])
  
  return {
    users,
    selfWatchlistInfo,
    othersWatchlistInfo,
    isUpdating,
    selectedUser,
    isEditModalOpen,
    setIsEditModalOpen,
    handleEditUser,
    handleUpdateUser,
  }
}