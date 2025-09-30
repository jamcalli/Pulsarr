import type { GetUserWatchlistResponse } from '@root/schemas/users/watchlist.schema'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'

/**
 * React hook for managing the state and data fetching of a user's watchlist in a UI component.
 *
 * Provides state, data, and handler functions for displaying, opening, closing, and refreshing a user's watchlist, including loading and error management.
 *
 * @returns An object containing the current watchlist data, loading and error states, open state, and handler functions for UI interaction and data management.
 */
export function useUserWatchlist() {
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [watchlistData, setWatchlistData] = useState<
    GetUserWatchlistResponse['data'] | null
  >(null)
  const [error, setError] = useState<Error | null>(null)

  const fetchUserWatchlist = async (userId: number) => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(api(`/v1/users/${userId}/watchlist`))
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to fetch user watchlist')
      }

      const data = (await response.json()) as GetUserWatchlistResponse
      setWatchlistData(data.data)
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error('Unknown error occurred')
      setError(error)
      toast.error(error.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleOpen = async (userId: number) => {
    setSelectedUserId(userId)
    setIsOpen(true)
    // Delay fetch to allow dropdown to close smoothly
    setTimeout(() => {
      fetchUserWatchlist(userId)
    }, 100)
  }

  const handleClose = () => {
    setIsOpen(false)
    setWatchlistData(null)
    setError(null)
  }

  const refetch = async () => {
    if (selectedUserId) {
      await fetchUserWatchlist(selectedUserId)
    }
  }

  return {
    watchlistData,
    isLoading,
    error,
    isOpen,
    handleOpen,
    handleClose,
    refetch,
  }
}
