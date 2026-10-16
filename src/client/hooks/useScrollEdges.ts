import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'

const EDGE_TOLERANCE = 2
const PAGE_FRACTION = 0.8

/** Tracks whether a scroller has more content past each edge, and pages it sideways by most of its width. Sets `--scroll-fade-width` on it to its visible width. */
export function useScrollEdges<T extends HTMLElement>(
  scrollRef?: RefObject<T | null>,
) {
  const ownRef = useRef<T>(null)
  const ref = scrollRef ?? ownRef
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const [canScrollUp, setCanScrollUp] = useState(false)
  const [canScrollDown, setCanScrollDown] = useState(false)

  const update = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.setProperty('--scroll-fade-width', `${el.clientWidth}px`)
    setCanScrollLeft(el.scrollLeft > EDGE_TOLERANCE)
    setCanScrollRight(
      el.scrollLeft + el.clientWidth < el.scrollWidth - EDGE_TOLERANCE,
    )
    setCanScrollUp(el.scrollTop > EDGE_TOLERANCE)
    setCanScrollDown(
      el.scrollTop + el.clientHeight < el.scrollHeight - EDGE_TOLERANCE,
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

  return {
    ref,
    canScrollLeft,
    canScrollRight,
    canScrollUp,
    canScrollDown,
    onScroll: update,
    page,
  }
}
