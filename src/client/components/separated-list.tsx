import { Children, Fragment, isValidElement, type ReactNode } from 'react'
import {
  Item,
  ItemActions,
  ItemGroup,
  ItemSeparator,
} from '@/components/ui/item'

/** Draws a separator between each keyed child, which should be a `SeparatedListRow`. */
export function SeparatedList({
  label,
  children,
}: {
  label?: string
  children: ReactNode
}) {
  const rows = Children.toArray(children).filter(isValidElement)
  return (
    <ItemGroup role="list" aria-label={label} className="gap-0">
      {rows.map((row, index) => (
        <Fragment key={row.key}>
          {index > 0 && <ItemSeparator className="my-0" />}
          {row}
        </Fragment>
      ))}
    </ItemGroup>
  )
}

export function SeparatedListRow({ children }: { children: ReactNode }) {
  return (
    <Item role="listitem" className="flex-wrap px-0 max-md:items-start">
      {children}
    </Item>
  )
}

/** Row buttons, which stretch to share the full width on phones. */
export function SeparatedListActions({ children }: { children: ReactNode }) {
  return (
    <ItemActions className="max-md:w-full max-md:*:h-10 max-md:*:flex-1">
      {children}
    </ItemActions>
  )
}
