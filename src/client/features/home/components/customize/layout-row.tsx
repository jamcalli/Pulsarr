import { cn } from 'cn'
import { GripVertical } from 'lucide-react'
import type { Ref } from 'react'
import { DRAGGING_CLASSES } from '@/components/drag-handle'
import { Button } from '@/components/ui/button'
import { KanbanColumn, KanbanColumnHandle } from '@/components/ui/kanban'
import {
  LayoutTile,
  LayoutTileFace,
} from '@/features/home/components/customize/layout-tile'
import { HOME_CARDS } from '@/features/home/lib/home-cards'
import {
  HOME_CARD_SPANS,
  type HomeCardId,
} from '@/features/home/lib/home-layout'

const ROW_GRID =
  'grid grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1fr)] gap-2 rounded-lg border-2 p-0.5 max-sm:grid-cols-[1.25rem_minmax(0,1fr)_minmax(0,1fr)] max-sm:gap-1.5'
const SLOT = 'h-11 rounded-md border-2 border-dashed border-divider'
const HANDLE = 'h-11 w-6 p-0 max-sm:w-5'

function rowLabel(cards: HomeCardId[]) {
  const [first, second] = cards.map((id) => HOME_CARDS[id].label)
  if (second) return `Move ${first} and ${second}`
  return HOME_CARD_SPANS[cards[0]] === 'full'
    ? `Move ${first}`
    : `Move the ${first} row`
}

function rowPlacement(cards: HomeCardId[]) {
  const alone = cards.length === 1
  const stranded = alone && HOME_CARD_SPANS[cards[0]] === 'half'
  const placement = (index: number) => {
    if (alone && !stranded) return 'col-start-2 col-end-4'
    return index === 0 ? 'col-start-2' : 'col-start-3'
  }
  return { placement, stranded }
}

interface LayoutRowProps {
  value: string
  cards: HomeCardId[]
  newRow?: boolean
  onHide: (id: HomeCardId) => void
  hideRef: (id: HomeCardId) => Ref<HTMLButtonElement>
}

export function LayoutRow({
  value,
  cards,
  newRow,
  onHide,
  hideRef,
}: LayoutRowProps) {
  const { placement, stranded } = rowPlacement(cards)
  return (
    <KanbanColumn
      value={value}
      className={cn(
        ROW_GRID,
        'border-transparent bg-transparent has-[[data-slot=row-handle]:focus-visible]:bg-accent has-[[data-slot=row-handle]:hover]:bg-accent',
        DRAGGING_CLASSES,
      )}
    >
      {cards.length === 0 ? (
        <div
          className={cn(
            SLOT,
            'col-start-2 col-end-4',
            newRow && 'flex items-center justify-center text-muted-foreground',
          )}
        >
          {newRow && 'New row'}
        </div>
      ) : (
        <>
          {!newRow && (
            <KanbanColumnHandle
              data-slot="row-handle"
              aria-label={rowLabel(cards)}
              render={<Button variant="ghost" className={HANDLE} />}
            >
              <GripVertical className="size-4" />
            </KanbanColumnHandle>
          )}
          {cards.map((id, index) => (
            <LayoutTile
              key={id}
              id={id}
              className={placement(index)}
              onHide={() => onHide(id)}
              hideRef={hideRef(id)}
            />
          ))}
          {stranded && <div className={cn(SLOT, 'col-start-3')} />}
        </>
      )}
    </KanbanColumn>
  )
}

export function LayoutRowFace({ cards }: { cards: HomeCardId[] }) {
  const { placement, stranded } = rowPlacement(cards)
  return (
    <div className={cn(ROW_GRID, 'border-border bg-card shadow-shadow')}>
      <span
        className={cn(
          HANDLE,
          'flex items-center justify-center rounded-md bg-accent text-foreground',
        )}
      >
        <GripVertical className="size-4" />
      </span>
      {cards.map((id, index) => (
        <LayoutTileFace
          key={id}
          id={id}
          lifted={false}
          className={placement(index)}
        />
      ))}
      {stranded && <div className={cn(SLOT, 'col-start-3')} />}
    </div>
  )
}
