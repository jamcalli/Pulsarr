import { Fragment, type ReactNode } from 'react'
import { PosterFrameSkeleton } from '@/components/poster-frame'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
} from '@/components/ui/item'
import { Skeleton } from '@/components/ui/skeleton'

interface ItemRowsSkeletonProps {
  count: number
  action: ReactNode
}

export function ItemRowsSkeleton({ count, action }: ItemRowsSkeletonProps) {
  return (
    <ItemGroup className="gap-0">
      {Array.from({ length: count }, (_, row) => `row-${row}`).map(
        (key, index) => (
          <Fragment key={key}>
            {index > 0 && <ItemSeparator className="my-0" />}
            <Item className="flex-nowrap px-2">
              <ItemMedia>
                <PosterFrameSkeleton size="thumb" />
              </ItemMedia>
              <ItemContent className="gap-2">
                <Skeleton className="h-4 w-48 max-w-full" />
                <Skeleton className="h-4 w-64 max-w-full" />
                <Skeleton className="h-4 w-40 max-w-full" />
              </ItemContent>
              <ItemActions>{action}</ItemActions>
            </Item>
          </Fragment>
        ),
      )}
    </ItemGroup>
  )
}
