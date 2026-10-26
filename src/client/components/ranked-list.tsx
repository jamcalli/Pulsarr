import type { ReactNode } from 'react'
import { ItemButton } from '@/components/item-button'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'

export interface RankedListItem {
  key: string
  rank: number
  title: string
  media?: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  onSelect?: () => void
  onIntent?: () => void
}

function RankedRow({ item }: { item: RankedListItem }) {
  return (
    <>
      <span className="w-6 shrink-0 text-muted-foreground tabular-nums">
        {item.rank}
      </span>
      {item.media && <ItemMedia>{item.media}</ItemMedia>}
      <ItemContent className="min-w-0 gap-0.5">
        <ItemTitle className="w-full min-w-0">
          <span className="min-w-0 truncate">{item.title}</span>
        </ItemTitle>
        {item.subtitle && (
          <ItemDescription className="line-clamp-1">
            {item.subtitle}
          </ItemDescription>
        )}
      </ItemContent>
      {item.trailing && <ItemActions>{item.trailing}</ItemActions>}
    </>
  )
}

export function RankedList({ items }: { items: RankedListItem[] }) {
  return (
    <ItemGroup className="gap-0">
      {items.map((item) =>
        item.onSelect ? (
          <ItemButton
            key={item.key}
            size="sm"
            onClick={item.onSelect}
            onIntent={item.onIntent}
          >
            <RankedRow item={item} />
          </ItemButton>
        ) : (
          <Item key={item.key} size="sm" className="flex-nowrap px-0">
            <RankedRow item={item} />
          </Item>
        ),
      )}
    </ItemGroup>
  )
}
