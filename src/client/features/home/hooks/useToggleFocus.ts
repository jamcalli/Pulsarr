import { type RefCallback, useRef } from 'react'
import type { HomeCardId } from '@/features/home/lib/home-layout'

type ToggleControl = 'hide' | 'show'

/** Moves focus to a card's hide or show control when the render after a toggle mounts it. */
export function useToggleFocus() {
  const pending = useRef<string | null>(null)
  return {
    controlRef:
      (
        control: ToggleControl,
        id: HomeCardId,
      ): RefCallback<HTMLButtonElement> =>
      (node) => {
        if (!node || pending.current !== `${control}:${id}`) return
        pending.current = null
        node.focus()
      },
    focusNext: (control: ToggleControl, id: HomeCardId) => {
      pending.current = `${control}:${id}`
    },
  }
}
