import type { DragStartEvent } from '@dnd-kit/core'
import { useRef, useState } from 'react'
import type { HomeLayoutState } from '@/features/home/hooks/useHomeLayout'
import {
  type BoardColumns,
  fitsRow,
  type HomeRow,
  NEW_ROW_COLUMN,
} from '@/features/home/lib/home-layout'
import type { HomeLayout } from '@/features/home/lib/home-prefs'

/** Pinned to the stored layout it was taken from, so a reset or hide during a drag is not overwritten on drop. */
interface Draft {
  layout: HomeLayout
  columns: BoardColumns
}

/** Keyed by the row's cards, so a dragged row keeps its id after the drop and the overlay lands on it. */
function toColumns(rows: HomeRow[]): BoardColumns {
  const columns: BoardColumns = {}
  for (const row of rows) columns[`row:${row.cards.join('+')}`] = [...row.cards]
  return columns
}

/** Holds board moves in a draft while a drag is live and saves them once it ends. The new row column exists only while a card is dragged. */
export function useLayoutBoard({ layout, rows, setRows }: HomeLayoutState) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [draggingItem, setDraggingItem] = useState(false)
  const dragging = useRef(false)

  const saved = toColumns(rows)
  const live = draft?.layout === layout ? draft.columns : null
  const commit = (columns: BoardColumns) => setRows(Object.values(columns))
  const endDrag = () => {
    dragging.current = false
    setDraft(null)
    setDraggingItem(false)
  }

  return {
    columns:
      live ?? (draggingItem ? { ...saved, [NEW_ROW_COLUMN]: [] } : saved),
    draggingItem,
    onValueChange: (columns: BoardColumns) => {
      if (!dragging.current) commit(columns)
      else if (Object.values(columns).every(fitsRow))
        setDraft({ layout, columns })
    },
    onDragStart: ({ active }: DragStartEvent) => {
      dragging.current = true
      setDraggingItem(!(active.id in saved))
    },
    onDragEnd: () => {
      if (live) commit(live)
      endDrag()
    },
    onDragCancel: endDrag,
  }
}
