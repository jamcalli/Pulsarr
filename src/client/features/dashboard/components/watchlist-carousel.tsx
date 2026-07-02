import type { ContentStat } from '@root/schemas/stats/stats.schema'
import { useMemo } from 'react'
import { DashboardMediaCarousel } from '@/features/dashboard/components/dashboard-media-carousel'
import { MediaCard } from '@/features/dashboard/components/media-card'
import type { MediaViewMode } from '@/features/dashboard/hooks/useMediaViewMode'

interface WatchlistCarouselProps {
  title: string
  items: ContentStat[]
  className?: string
  loading?: boolean
  error?: string | null
  view?: MediaViewMode
}

/** Most Watchlisted section: sorts by count then title. */
export function WatchlistCarousel({
  title,
  items = [],
  className,
  loading = false,
  error = null,
  view,
}: WatchlistCarouselProps) {
  const sortedItems = useMemo(() => {
    if (!items || !Array.isArray(items) || items.length === 0) return []

    return [...items].sort((a, b) => {
      const countA = typeof a.count === 'number' ? a.count : 0
      const countB = typeof b.count === 'number' ? b.count : 0

      if (countA !== countB) {
        return countB - countA
      }

      const titleA = typeof a.title === 'string' ? a.title : ''
      const titleB = typeof b.title === 'string' ? b.title : ''

      return titleA.localeCompare(titleB)
    })
  }, [items])

  return (
    <DashboardMediaCarousel
      title={title}
      items={sortedItems}
      loading={loading}
      error={error}
      emptyMessage="No data available"
      className={className}
      view={view}
      getKey={(item, index) =>
        // Guid keys survive reorders (no remounts); index keeps the fallback unique
        item.guids?.[0] ??
        `item-${typeof item.title === 'string' ? item.title : ''}-${item.count}-${index}`
      }
      renderItem={(item, orientation, index) => (
        <MediaCard item={item} orientation={orientation} priority={index < 3} />
      )}
    />
  )
}
