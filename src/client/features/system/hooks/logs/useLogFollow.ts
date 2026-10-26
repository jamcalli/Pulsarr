import {
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

const AT_BOTTOM_PX = 4

interface Anchor {
  id: string
  offset: number
}

function rowElements(scroller: HTMLElement) {
  return scroller.querySelectorAll<HTMLElement>('tbody > tr[data-row-id]')
}

function findAnchor(scroller: HTMLElement): Anchor | null {
  const top = scroller.getBoundingClientRect().top
  for (const row of rowElements(scroller)) {
    const rect = row.getBoundingClientRect()
    if (rect.bottom > top && row.dataset.rowId) {
      return { id: row.dataset.rowId, offset: rect.top - top }
    }
  }
  return null
}

function isAtBottom(scroller: HTMLElement): boolean {
  return (
    scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <=
    AT_BOTTOM_PX
  )
}

function revealExpanded(scroller: HTMLElement, id: string) {
  const row = scroller.querySelector<HTMLElement>(`tr[data-row-id="${id}"]`)
  if (!row) return
  const next = row.nextElementSibling
  const detail = next && !next.hasAttribute('data-row-id') ? next : row
  const origin = scroller.getBoundingClientRect().top - scroller.scrollTop
  const header =
    scroller.querySelector('thead')?.getBoundingClientRect().height ?? 0
  const top = row.getBoundingClientRect().top - origin - header
  const bottom = detail.getBoundingClientRect().bottom - origin
  const viewTop = scroller.scrollTop
  const viewHeight = scroller.clientHeight - header
  if (bottom - top - header > viewHeight || top < viewTop) {
    scroller.scrollTop = top
  } else if (bottom > viewTop + scroller.clientHeight) {
    scroller.scrollTop = bottom - scroller.clientHeight
  }
}

export function useLogFollow(
  scrollRef: RefObject<HTMLDivElement | null>,
  expandedId: string | null,
) {
  const [following, setFollowing] = useState(true)
  const [scroller, setScroller] = useState<HTMLElement | null>(null)
  const anchor = useRef<Anchor | null>(null)
  const revealed = useRef<string | null>(null)
  const latest = useRef(following)
  latest.current = following

  useLayoutEffect(() => {
    const element = scrollRef.current
    setScroller(element)
    if (!element) return
    if (following) {
      element.scrollTop = element.scrollHeight
    } else if (anchor.current) {
      const { id, offset } = anchor.current
      const row = element.querySelector(`tr[data-row-id="${id}"]`)
      if (row) {
        const moved =
          row.getBoundingClientRect().top -
          element.getBoundingClientRect().top -
          offset
        element.scrollTop += moved
      }
    }
    if (expandedId !== revealed.current) {
      revealed.current = expandedId
      if (expandedId !== null) revealExpanded(element, expandedId)
    }
    anchor.current = findAnchor(element)
  })

  useEffect(() => {
    if (!scroller) return
    const onScroll = () => {
      anchor.current = findAnchor(scroller)
      const atBottom = isAtBottom(scroller)
      if (atBottom && !latest.current) setFollowing(true)
      if (!atBottom && latest.current) setFollowing(false)
    }
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => scroller.removeEventListener('scroll', onScroll)
  }, [scroller])

  return {
    stop: () => setFollowing(false),
    follow: () => setFollowing(true),
  }
}
