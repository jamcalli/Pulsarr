import { type RefObject, useLayoutEffect } from 'react'
import { useIsMobile } from '@/hooks/useIsMobile'

const MIN_HEIGHT_PX = 360

function visibleHeightBelowHeader(): number {
  const header = document.querySelector('[data-slot="app-header"]')
  const top = header?.getBoundingClientRect().bottom ?? 0
  const scroller = header?.parentElement?.getBoundingClientRect().bottom
  // The root's clientHeight is the small viewport, so the card holds still as phone toolbars hide.
  const viewport = document.documentElement.clientHeight
  return Math.min(viewport, scroller ?? viewport) - top
}

/** Sets `--log-stream-height` so the stream fills the visible part of the app header's scroller below it, with the card around it on desktop and on its own on phones, at least 360px. */
export function useStreamHeight(ref: RefObject<HTMLElement | null>) {
  const isMobile = useIsMobile()

  useLayoutEffect(() => {
    const card = ref.current
    if (!card) return
    const measure = () => {
      const body = card.querySelector(
        '[data-slot="card-content"]',
      )?.lastElementChild
      if (!body) return
      const chrome = isMobile
        ? 0
        : card.getBoundingClientRect().height -
          body.getBoundingClientRect().height
      const height = Math.max(
        MIN_HEIGHT_PX,
        visibleHeightBelowHeader() - chrome,
      )
      card.style.setProperty('--log-stream-height', `${height}px`)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(card)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [ref, isMobile])
}
