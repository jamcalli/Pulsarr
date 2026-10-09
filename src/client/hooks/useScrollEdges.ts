import { useCallback, useEffect, useRef, useState } from 'react'

const EDGE_TOLERANCE = 2
const PAGE_FRACTION = 0.8

/** Tracks whether a horizontal scroller has more content to either side, and pages it by most of its width. */
export function useScrollEdges<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const update = useCallback(() => {
    const el = ref.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > EDGE_TOLERANCE)
    setCanScrollRight(
      el.scrollLeft + el.clientWidth < el.scrollWidth - EDGE_TOLERANCE,
    )
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    update()
    const observer = new ResizeObserver(update)
    // Content can change width without the scroller resizing, so watch both.
    observer.observe(el)
    if (el.firstElementChild) observer.observe(el.firstElementChild)
    return () => observer.disconnect()
  }, [update])

  const page = (direction: 1 | -1) => {
    const el = ref.current
    if (!el) return
    const reduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    el.scrollBy({
      left: el.clientWidth * PAGE_FRACTION * direction,
      behavior: reduced ? 'auto' : 'smooth',
    })
  }

  return { ref, canScrollLeft, canScrollRight, onScroll: update, page }
}
