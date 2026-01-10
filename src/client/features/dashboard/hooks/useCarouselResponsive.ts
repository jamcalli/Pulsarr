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
  const isMD = useMediaQuery('(min-width: 768px)')
  // Check if cards are stacked (single column) vs side-by-side
  const isStacked = useMediaQuery('(max-width: 1279px)')
  // Check for smaller stacked screens where 3 posters is too many
  const isSmallStacked = useMediaQuery('(max-width: 1100px)')

  const carouselItemClass = useMemo(() => {
    // When stacked (< 1280px): both components are full-width, same logic
    if (isStacked) {
      if (fullscreenEnabled) {
        if (isMD2) return 'pl-2 md:pl-4 basis-1/3 p-1' // 3 items (1200-1279px)
        if (isMD) return 'pl-2 md:pl-4 basis-1/2 p-1' // 2 items (768-1199px)
        return 'pl-2 md:pl-4 basis-1/2 p-1' // 2 items (<768px)
      }
      // Windowed stacked
      if (isSmallStacked) return 'pl-2 md:pl-4 basis-1/2 p-1' // 2 items (≤1100px)
      return 'pl-2 md:pl-4 basis-1/3 p-1' // 3 items (1101-1279px)
    }

    // Side-by-side (>= 1280px): behavior differs based on fullWidth
    if (fullWidth) {
      // Full-width component: double the items
      if (fullscreenEnabled) {
        if (isXXL) return 'pl-2 md:pl-4 basis-[10%] p-1' // 10 items
        if (isXL) return 'pl-2 md:pl-4 basis-[12.5%] p-1' // 8 items
        if (isLG) return 'pl-2 md:pl-4 basis-1/6 p-1' // 6 items
        return 'pl-2 md:pl-4 basis-1/4 p-1' // 4 items
      }
      // Windowed full-width
      return 'pl-2 md:pl-4 basis-1/4 p-1' // 4 items
    }

    // Half-width component (default): standard item count
    if (fullscreenEnabled) {
      if (isXXL) return 'pl-2 md:pl-4 basis-1/5 p-1' // 5 items
      if (isXL) return 'pl-2 md:pl-4 basis-1/4 p-1' // 4 items
      if (isLG) return 'pl-2 md:pl-4 basis-1/3 p-1' // 3 items
      if (isMD2) return 'pl-2 md:pl-4 basis-1/2 p-1' // 2 items
      if (isMD) return 'pl-2 md:pl-4 basis-1/2 p-1' // 2 items
      return 'pl-2 md:pl-4 basis-1/2 p-1' // 2 items
    }
    // Windowed half-width
    return 'pl-2 md:pl-4 basis-1/2 p-1' // 2 items
  }, [
    fullscreenEnabled,
    fullWidth,
    isXXL,
    isXL,
    isLG,
    isMD2,
    isMD,
    isStacked,
    isSmallStacked,
  ])

  return { carouselItemClass }
}
