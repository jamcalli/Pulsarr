import { useMemo } from 'react'
import { useMediaQuery } from '@/hooks/use-media-query'

interface UseCarouselResponsiveOptions {
  fullscreenEnabled: boolean
  /**
   * When true, component takes full width in side-by-side mode (shows 2x items).
   * When false, component takes half width (default carousel behavior).
   */
  fullWidth?: boolean
}

/**
 * Shared responsive logic for dashboard carousels.
 *
 * Provides consistent breakpoint handling and carousel item sizing
 * for both WatchlistCarousel and RecentRequests components.
 */
export function useCarouselResponsive({
  fullscreenEnabled,
  fullWidth = false,
}: UseCarouselResponsiveOptions) {
  // Custom breakpoints for poster visibility
  const isXXL = useMediaQuery('(min-width: 2450px)')
  const isXL = useMediaQuery('(min-width: 1900px)')
  const isLG = useMediaQuery('(min-width: 1600px)')
  const isMD2 = useMediaQuery('(min-width: 1200px)')
  // Check if cards are stacked (single column) vs side-by-side
  const isStacked = useMediaQuery('(max-width: 1279px)')
  // Check for smaller stacked screens where 3 posters is too many
  const isSmallStacked = useMediaQuery('(max-width: 1100px)')

  const carouselItemClass = useMemo(() => {
    const cls = (basis: string) => `pl-2 md:pl-4 ${basis}`

    // When stacked (< 1280px): both components are full-width, same logic
    if (isStacked) {
      if (fullscreenEnabled) {
        if (isMD2) return cls('basis-1/3') // 3 items (1200-1279px)
        return cls('basis-1/2') // 2 items (<1200px)
      }
      // Windowed stacked
      if (isSmallStacked) return cls('basis-1/2') // 2 items (≤1100px)
      return cls('basis-1/3') // 3 items (1101-1279px)
    }

    // Side-by-side (>= 1280px): behavior differs based on fullWidth
    if (fullWidth) {
      // Full-width component: double the items
      if (fullscreenEnabled) {
        if (isXXL) return cls('basis-[10%]') // 10 items
        if (isXL) return cls('basis-[12.5%]') // 8 items
        if (isLG) return cls('basis-1/6') // 6 items
        return cls('basis-1/4') // 4 items
      }
      // Windowed full-width
      return cls('basis-1/4') // 4 items
    }

    // Half-width component (default): standard item count
    if (fullscreenEnabled) {
      if (isXXL) return cls('basis-1/5') // 5 items
      if (isXL) return cls('basis-1/4') // 4 items
      if (isLG) return cls('basis-1/3') // 3 items
      return cls('basis-1/2') // 2 items
    }
    // Windowed half-width
    return cls('basis-1/2') // 2 items
  }, [
    fullscreenEnabled,
    fullWidth,
    isXXL,
    isXL,
    isLG,
    isMD2,
    isStacked,
    isSmallStacked,
  ])

  return { carouselItemClass }
}
