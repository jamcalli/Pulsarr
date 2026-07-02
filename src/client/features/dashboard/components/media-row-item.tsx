import type { ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface MediaRowItemProps {
  poster: ReactNode
  text: ReactNode
  badge: ReactNode
  onSelect?: () => void
  selectLabel?: string
  className?: string
}

/**
 * Dashboard list row. The tap target is an overlay button because buttons
 * can't contain block content; the badge stacks above it to stay clickable.
 */
export function MediaRowItem({
  poster,
  text,
  badge,
  onSelect,
  selectLabel,
  className,
}: MediaRowItemProps) {
  return (
    <Card
      className={cn(
        'relative shadow-none bg-secondary-background text-foreground',
        className,
      )}
    >
      <CardContent className="flex flex-row items-center gap-3 p-2.5">
        {onSelect && (
          <button
            type="button"
            className="absolute inset-0 z-10 cursor-pointer"
            onClick={onSelect}
            aria-label={selectLabel}
            title={selectLabel}
          />
        )}
        {poster}
        <div className="min-w-0 flex-1">{text}</div>
        {/* Plain badges let taps through; popover badges opt back in via pointer-events-auto */}
        <span className="pointer-events-none relative z-20 shrink-0">
          {badge}
        </span>
      </CardContent>
    </Card>
  )
}
