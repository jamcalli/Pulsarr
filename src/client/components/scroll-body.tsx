import { cn } from 'cn'
import type { ReactNode } from 'react'
import { useScrollEdges } from '@/hooks/useScrollEdges'

const INSET_CLASSES = {
  dialog: '-mx-6 -my-1 px-6 py-1 max-sm:-mx-4 max-sm:px-4',
  drawer: 'px-4 py-2',
} as const

/** Scrolls on its own so the header and footer stay in view, with a divider on each edge that has more content past it. */
export function ScrollBody({
  inset,
  className,
  children,
}: {
  inset: keyof typeof INSET_CLASSES
  className?: string
  children: ReactNode
}) {
  const edges = useScrollEdges<HTMLDivElement>()
  return (
    <div
      ref={edges.ref}
      onScroll={edges.onScroll}
      className={cn(
        'relative min-h-0 overflow-y-auto border-y border-transparent',
        INSET_CLASSES[inset],
        edges.canScrollUp && 'border-t-divider',
        edges.canScrollDown && 'border-b-divider',
      )}
    >
      <div className={className}>{children}</div>
    </div>
  )
}
