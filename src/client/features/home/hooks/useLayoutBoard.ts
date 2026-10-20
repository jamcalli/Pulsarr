import type { DragStartEvent } from '@dnd-kit/core'
import { useRef, useState } from 'react'
import type { HomeLayoutState } from '@/features/home/hooks/useHomeLayout'
import {
  type BoardColumns,
  fitsRow,
  type HomeRow,
  NEW_ROW_COLUMN,
} from '@/features/home/lib/home-layout'

function toColumns(rows: HomeRow[]): BoardColumns {
  const columns: BoardColumns = {}
  rows.forEach((row, index) => {
    columns[`row-${index}`] = [...row.cards]
  })
  return columns
}

/** Holds board moves in a draft while a drag is live and saves them once it ends. The new row column exists only while a card is dragged. */
export function useLayoutBoard({ rows, setRows }: HomeLayoutState) {
  const [draft, setDraft] = useState<BoardColumns | null>(null)
  const [draggingItem, setDraggingItem] = useState(false)
  const dragging = useRef(false)

  const saved = toColumns(rows)
  const commit = (columns: BoardColumns) => setRows(Object.values(columns))
  const endDrag = () => {
    dragging.current = false
    setDraft(null)
    setDraggingItem(false)
  }

  return {
    columns:
      draft ?? (draggingItem ? { ...saved, [NEW_ROW_COLUMN]: [] } : saved),
    draggingItem,
    onValueChange: (columns: BoardColumns) => {
      if (!dragging.current) commit(columns)
      else if (Object.values(columns).every(fitsRow)) setDraft(columns)
    },
    onDragStart: ({ active }: DragStartEvent) => {
      dragging.current = true
      setDraggingItem(!(active.id in saved))
    },
    onDragEnd: () => {
      if (draft) commit(draft)
      endDrag()
    },
    onDragCancel: endDrag,
  }
}
