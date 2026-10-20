import { cn } from 'cn'
import { EyeOff, GripVertical } from 'lucide-react'
import type { Ref } from 'react'
import { Button } from '@/components/ui/button'
import { KanbanItem, KanbanItemHandle } from '@/components/ui/kanban'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { HOME_CARDS } from '@/features/home/lib/home-cards'
import {
  HOME_CARD_SPANS,
  type HomeCardId,
} from '@/features/home/lib/home-layout'

const TILE =
  'flex h-11 min-w-0 items-center gap-1.5 rounded-md border-2 border-border bg-surface pr-1.5 max-sm:gap-1 max-sm:pr-1'
const NAME = 'flex-1 truncate font-medium max-sm:text-xs'

function tilePadding(id: HomeCardId) {
  return HOME_CARD_SPANS[id] === 'full'
    ? 'pl-3 max-sm:pl-2.5'
    : 'pl-1.5 max-sm:pl-1'
}

interface LayoutTileProps {
  id: HomeCardId
  className?: string
  onHide: () => void
  hideRef: Ref<HTMLButtonElement>
}

export function LayoutTile({
  id,
  className,
  onHide,
  hideRef,
}: LayoutTileProps) {
  const { label } = HOME_CARDS[id]
  return (
    <KanbanItem
      value={id}
      className={cn(
        TILE,
        tilePadding(id),
        'data-dragging:border-dashed data-dragging:border-primary data-dragging:bg-accent data-dragging:opacity-100 data-dragging:*:invisible',
        className,
      )}
    >
      {HOME_CARD_SPANS[id] !== 'full' && (
        <KanbanItemHandle
          aria-label={`Move ${label}`}
          render={<Button variant="ghost" size="icon-xs" />}
        >
          <GripVertical className="size-3" />
        </KanbanItemHandle>
      )}
      <span className={NAME}>{label}</span>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              ref={hideRef}
              type="button"
              variant="ghost"
              size="xs"
              className="max-sm:size-6 max-sm:px-0"
              aria-label={`Hide ${label}`}
              onClick={onHide}
            />
          }
        >
          <EyeOff className="size-3 sm:hidden" />
          <span className="max-sm:hidden">Hide</span>
        </TooltipTrigger>
        <TooltipContent className="sm:hidden">Hide</TooltipContent>
      </Tooltip>
    </KanbanItem>
  )
}

/** Plain markup for the drag overlay, since a KanbanItem there would render as the drag placeholder. */
export function LayoutTileFace({
  id,
  lifted,
  className,
}: {
  id: HomeCardId
  lifted: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        TILE,
        tilePadding(id),
        lifted && 'shadow-shadow',
        className,
      )}
    >
      {HOME_CARD_SPANS[id] !== 'full' && (
        <span
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground',
            lifted && 'bg-accent',
          )}
        >
          <GripVertical className="size-3" />
        </span>
      )}
      <span className={NAME}>{HOME_CARDS[id].label}</span>
      <span className="flex h-6 shrink-0 items-center px-2 text-xs font-bold text-muted-foreground max-sm:w-6 max-sm:justify-center max-sm:px-0">
        <EyeOff className="size-3 sm:hidden" />
        <span className="max-sm:hidden">Hide</span>
      </span>
    </div>
  )
}
