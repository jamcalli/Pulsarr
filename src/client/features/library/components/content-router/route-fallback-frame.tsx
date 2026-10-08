import type { ReactNode } from 'react'
import { Item, ItemContent, ItemMedia } from '@/components/ui/item'

export function RouteFallbackFrame({
  media,
  children,
}: {
  media: ReactNode
  children: ReactNode
}) {
  return (
    <Item
      variant="outline"
      className="flex-nowrap rounded-lg border-dashed px-6 max-md:px-4"
    >
      <ItemMedia className="w-14">{media}</ItemMedia>
      <ItemContent>{children}</ItemContent>
    </Item>
  )
}
