import { keepPreviousData } from '@tanstack/react-query'
import { ALL_ROWS } from '@/features/home/lib/ranked-rows'
import { useMinLoading } from '@/hooks/useMinLoading'
import { $api, apiErrorMessage } from '@/lib/tanstackApi'

export type TopGenres = ReturnType<typeof useTopGenres>

export function useTopGenres(days: number) {
  const query = useMinLoading(
    $api.useQuery(
      'get',
      '/v1/stats/genres',
      { params: { query: { days, limit: ALL_ROWS } } },
      { placeholderData: keepPreviousData },
    ),
  )

  return {
    days,
    data: query.data,
    isLoading: query.isLoading,
    errorMessage: query.isError
      ? (apiErrorMessage(query.error) ?? 'Top genres failed to load.')
      : null,
  }
}
