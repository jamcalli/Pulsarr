import { useState } from 'react'
import type { MediaItem } from '@/features/home/lib/media-item'

/** The item is looked up live by key and falls back to the clicked snapshot, so it outlives the close and leaving the list. */
export function useMediaSelection(
  resolve: (key: string) => MediaItem | undefined,
) {
  const [selected, setSelected] = useState<{
    key: string
    snapshot: MediaItem
    open: boolean
  } | null>(null)

  const selection = selected && {
    item: resolve(selected.key) ?? selected.snapshot,
    open: selected.open,
  }

  return {
    selection,
    select: (key: string, item: MediaItem) =>
      setSelected({ key, snapshot: item, open: true }),
    setOpen: (open: boolean) =>
      setSelected((current) => (current ? { ...current, open } : null)),
  }
}
