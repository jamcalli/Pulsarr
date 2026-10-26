import { useEffect, useRef } from 'react'

const INTENT_DELAY_MS = 150

/** Handler props that call onIntent once the pointer rests or focus lands for INTENT_DELAY_MS. */
export function useIntent(onIntent?: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const cancel = () => clearTimeout(timer.current)
  const start = () => {
    cancel()
    if (onIntent) timer.current = setTimeout(onIntent, INTENT_DELAY_MS)
  }

  return {
    onPointerEnter: start,
    onPointerLeave: cancel,
    onFocus: start,
    onBlur: cancel,
  }
}
