import { MediaDetail } from '@/components/media-detail/media-detail'
import {
  RequestList,
  RequestPosters,
} from '@/components/request-list/request-list'
import type { RequestBrowser } from '@/hooks/useRequestBrowser'
import type { RecentRequest } from '@/lib/media-item'
import type { MediaView } from '@/lib/request-list-prefs'

interface RequestBrowserItemsProps {
  browser: RequestBrowser
  items: RecentRequest[]
  view: MediaView
}

export function RequestBrowserItems({
  browser,
  items,
  view,
}: RequestBrowserItemsProps) {
  const Items = view === 'carousel' ? RequestPosters : RequestList
  return (
    <Items
      items={items}
      onSelect={browser.onSelect}
      onIntent={browser.onIntent}
    />
  )
}

export function RequestBrowserDetail({ browser }: { browser: RequestBrowser }) {
  const { selection } = browser
  if (!selection) return null
  return (
    <MediaDetail
      open={selection.open}
      onOpenChange={browser.setOpen}
      item={selection.item}
    />
  )
}
