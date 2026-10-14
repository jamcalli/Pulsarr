import { requestKey } from '@/components/request-list/request-list'
import { useMediaSelection } from '@/hooks/useMediaSelection'
import { usePrefetchMediaDetail } from '@/hooks/usePrefetchMediaDetail'
import { type RecentRequest, recentRequestItem } from '@/lib/media-item'

export type RequestBrowser = ReturnType<typeof useRequestBrowser>

/** Resolves the open request against `items`, so pass the full list rather than the visible page. */
export function useRequestBrowser(items: RecentRequest[] | undefined) {
  const { selection, select, setOpen } = useMediaSelection((key) => {
    const request = items?.find((item) => requestKey(item) === key)
    return request && recentRequestItem(request)
  })
  const prefetch = usePrefetchMediaDetail()
  return {
    selection,
    setOpen,
    onSelect: (request: RecentRequest) =>
      select(requestKey(request), recentRequestItem(request)),
    onIntent: (request: RecentRequest) => prefetch(recentRequestItem(request)),
  }
}
