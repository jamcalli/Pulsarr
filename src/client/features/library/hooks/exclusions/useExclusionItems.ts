import { keepPreviousData } from '@tanstack/react-query'
import type { PageSize } from '@/components/data-table/page-size'
import {
  type ExclusionsState,
  toQuery,
} from '@/features/library/lib/exclusions/exclusions-state'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { SEARCH_DEBOUNCE_DELAY } from '@/lib/constants'
import { watchlistExclusionKeys } from '@/lib/query-keys'
import { queryClient } from '@/lib/queryClient'
import { $api, isSettled, loadErrorMessage } from '@/lib/tanstackApi'

export function invalidateExclusionItems() {
  return queryClient.invalidateQueries({
    queryKey: watchlistExclusionKeys.items,
  })
}

export function useExclusionItems(state: ExclusionsState, pageSize: PageSize) {
  const q = useDebouncedValue(state.q, SEARCH_DEBOUNCE_DELAY)
  const list = $api.useQuery(
    'get',
    '/v1/watchlist-exclusions/items',
    { params: { query: toQuery({ ...state, q }, pageSize) } },
    { placeholderData: keepPreviousData },
  )

  return {
    rows: list.data?.items ?? null,
    total: list.data?.total ?? 0,
    isReady: isSettled(list),
    stale: list.isPlaceholderData,
    errorMessage: loadErrorMessage(list, "Couldn't load the watchlist items."),
    retry: () => void invalidateExclusionItems(),
  }
}
