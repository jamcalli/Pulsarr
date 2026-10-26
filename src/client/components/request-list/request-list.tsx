import { Fragment } from 'react'
import { ItemButton } from '@/components/item-button'
import { PosterCard } from '@/components/poster-card'
import { PosterFrame } from '@/components/poster-frame'
import { PosterRow } from '@/components/poster-row'
import { RequestStatus } from '@/components/request-list/request-status'
import {
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from '@/components/ui/item'
import { useUserDirectory } from '@/hooks/useUserDirectory'
import { formatList, formatRelative } from '@/lib/format'
import type { RecentRequest } from '@/lib/media-item'

function requestedBy(item: RecentRequest, userName: string): string {
  return `${userName}, ${formatRelative(new Date(item.createdAt))}`
}

interface RequestViewProps {
  items: RecentRequest[]
  onSelect: (item: RecentRequest) => void
  onIntent: (item: RecentRequest) => void
}

export function RequestList({ items, onSelect, onIntent }: RequestViewProps) {
  const { lookup } = useUserDirectory()
  return (
    <ItemGroup className="gap-0">
      {items.map((item, index) => (
        <Fragment key={`${item.source}-${item.id}`}>
          {index > 0 && <ItemSeparator className="my-0" />}
          <ItemButton
            onClick={() => onSelect(item)}
            onIntent={() => onIntent(item)}
          >
            <ItemMedia>
              <PosterFrame
                size="thumb"
                thumb={item.thumb}
                type={item.contentType}
              />
            </ItemMedia>
            <ItemContent className="min-w-0">
              <ItemTitle>{item.title}</ItemTitle>
              <ItemDescription>
                {requestedBy(item, lookup(item.userName).name)}
              </ItemDescription>
              {item.allInstances.length > 0 && (
                <ItemDescription className="line-clamp-1">
                  {formatList(
                    item.allInstances.map((instance) => instance.name),
                  )}
                </ItemDescription>
              )}
            </ItemContent>
            <ItemActions>
              <RequestStatus status={item.status} />
            </ItemActions>
          </ItemButton>
        </Fragment>
      ))}
    </ItemGroup>
  )
}

export function RequestPosters({
  items,
  onSelect,
  onIntent,
}: RequestViewProps) {
  const { lookup } = useUserDirectory()
  return (
    <PosterRow>
      {items.map((item) => (
        <PosterCard
          key={`${item.source}-${item.id}`}
          title={item.title}
          subtitle={requestedBy(item, lookup(item.userName).name)}
          thumb={item.thumb}
          type={item.contentType}
          status={<RequestStatus status={item.status} />}
          onSelect={() => onSelect(item)}
          onIntent={() => onIntent(item)}
        />
      ))}
    </PosterRow>
  )
}

// Approval and watchlist ids can collide, so the source is part of the key.
export function requestKey(request: RecentRequest) {
  return `${request.source}:${request.id}`
}
