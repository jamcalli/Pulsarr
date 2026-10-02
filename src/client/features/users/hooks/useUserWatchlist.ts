import type { GetUserWatchlistResponse } from '@root/schemas/users/watchlist.schema'
import { useState } from 'react'
import { toast } from 'sonner'
import { apiErrorMessage, apiFetch } from '@/lib/tanstackApi'

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
      const { data, error: fetchError } = await apiFetch.GET(
        '/v1/users/{userId}/watchlist',
        { params: { path: { userId } } },
      )
      if (fetchError) throw fetchError

      setWatchlistData(data.data)
    } catch (err) {
      const error = new Error(
        apiErrorMessage(err) ?? 'Failed to fetch user watchlist',
      )
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
    if (selectedUserId !== null) {
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
