import { cn } from 'cn'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { useScrollEdges } from '@/hooks/useScrollEdges'

const CHEVRON_CLASS = 'absolute top-1/2 z-10 -translate-y-1/2'

/** Scrolls its child sideways, fading and offering a paging button on each side that still has content. */
export function ScrollFade({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  const edges = useScrollEdges<HTMLDivElement>()

  return (
    <div className={cn('relative', className)}>
      <div
        ref={edges.ref}
        data-slot="table-container"
        onScroll={edges.onScroll}
        className={cn(
          'w-full overflow-x-auto',
          edges.canScrollLeft && 'mask-l-from-85%',
          edges.canScrollRight && 'mask-r-from-85%',
        )}
      >
        {children}
      </div>
      {edges.canScrollLeft && (
        <Button
          type="button"
          variant="neutral"
          size="icon-sm"
          aria-label="Scroll left"
          className={cn(CHEVRON_CLASS, 'left-1')}
          onClick={() => edges.page(-1)}
        >
          <ChevronLeft />
        </Button>
      )}
      {edges.canScrollRight && (
        <Button
          type="button"
          variant="neutral"
          size="icon-sm"
          aria-label="Scroll right"
          className={cn(CHEVRON_CLASS, 'right-1')}
          onClick={() => edges.page(1)}
        >
          <ChevronRight />
        </Button>
      )}
    </div>
  )
}
