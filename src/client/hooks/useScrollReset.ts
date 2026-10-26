import { type RefObject, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/** Scrolls the window and `container` to the top when a link changes the path. Back, forward and search changes keep their place. */
export function useScrollReset(container: RefObject<HTMLElement | null>) {
  const { pathname } = useLocation()
  const navigationType = useNavigationType()
  const previous = useRef(pathname)

  useLayoutEffect(() => {
    if (previous.current === pathname) return
    previous.current = pathname
    if (navigationType === 'POP') return
    window.scrollTo(0, 0)
    if (container.current) container.current.scrollTop = 0
  }, [pathname, navigationType, container])
}
