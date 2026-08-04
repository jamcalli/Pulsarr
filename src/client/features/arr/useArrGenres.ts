import { useCallback } from 'react'
import { $api } from '@/lib/tanstackApi'

export function useArrGenres() {
  const query = $api.useQuery('get', '/v1/plex/genres')
  const genres = query.data?.genres ?? []

  const { refetch } = query
  const hasGenres = genres.length > 0
  const handleGenreDropdownOpen = useCallback(async () => {
    if (!hasGenres) {
      await refetch()
    }
  }, [hasGenres, refetch])

  return { genres, handleGenreDropdownOpen, isLoading: query.isLoading }
}
