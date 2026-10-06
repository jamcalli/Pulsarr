import { keepPreviousData } from '@tanstack/react-query'
import { ALL_ROWS } from '@/features/home/lib/ranked-rows'
import { useMinLoading } from '@/hooks/useMinLoading'
import { $api, apiErrorMessage } from '@/lib/tanstackApi'

export type TopUsers = ReturnType<typeof useTopUsers>

export function useTopUsers(days: number) {
  const query = useMinLoading(
    $api.useQuery(
      'get',
      '/v1/stats/users',
      { params: { query: { days, limit: ALL_ROWS } } },
      { placeholderData: keepPreviousData },
    ),
  )

  return {
    days,
    data: query.data,
    isLoading: query.isLoading,
    errorMessage: query.isError
      ? (apiErrorMessage(query.error) ?? 'Most active users failed to load.')
      : null,
  }
}
