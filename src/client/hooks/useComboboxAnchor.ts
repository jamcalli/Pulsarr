import { useRef } from 'react'

export function useComboboxAnchor() {
  return useRef<HTMLDivElement | null>(null)
}
