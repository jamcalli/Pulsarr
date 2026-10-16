import { cn } from 'cn'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode, RefObject } from 'react'
import { Button } from '@/components/ui/button'
import { useScrollEdges } from '@/hooks/useScrollEdges'

const CHEVRON_CLASS = 'absolute top-1/2 z-10 -translate-y-1/2'

export interface ScrollFadeAction {
  label: string
  onClick: () => void
}

/** Scrolls its child sideways, fading and offering a paging button on each side that still has content, and the same at the bottom when given `bottomAction`. */
export function ScrollFade({
  className,
  scrollClassName,
  scrollRef,
  bottomAction,
  children,
}: {
  className?: string
  scrollClassName?: string
  scrollRef?: RefObject<HTMLDivElement | null>
  bottomAction?: ScrollFadeAction
  children: ReactNode
}) {
  const edges = useScrollEdges(scrollRef)
  const showBottom = bottomAction !== undefined && edges.canScrollDown

  return (
    <div className={cn('relative', className)}>
      <div
        ref={edges.ref}
        data-slot="table-container"
        onScroll={edges.onScroll}
        className={cn(
          'w-full overflow-x-auto',
          scrollClassName,
          edges.canScrollLeft && 'mask-l-from-85%',
          edges.canScrollRight && 'mask-r-from-85%',
          showBottom && 'mask-b-from-85%',
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
      {bottomAction && (
        <div
          aria-hidden={!showBottom}
          inert={!showBottom}
          className={cn(
            'absolute bottom-2 left-1/2 z-10 -translate-x-1/2 transition-opacity',
            !showBottom && 'opacity-0',
          )}
        >
          <Button
            type="button"
            variant="neutral"
            size="icon-sm"
            aria-label={bottomAction.label}
            onClick={bottomAction.onClick}
          >
            <ChevronDown />
          </Button>
        </div>
      )}
    </div>
  )
}
