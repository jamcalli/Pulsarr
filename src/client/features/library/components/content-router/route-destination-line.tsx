import { cn } from 'cn'
import { ArrowRight } from 'lucide-react'
import type { RouteDestination } from '@/features/library/lib/content-router/route-list'

export function RouteDestinationLine({
  destination,
}: {
  destination: RouteDestination
}) {
  const head = destination.kind === 'skipped' ? 'Not routed.' : destination.name
  const separator = destination.kind === 'skipped' ? ' ' : ', '
  return (
    <span className="flex items-start gap-2 text-sm break-words text-muted-foreground">
      <ArrowRight
        aria-hidden
        className={cn(
          'mt-0.5 size-4 shrink-0',
          destination.kind === 'skipped' ? 'text-foreground' : 'text-primary',
        )}
      />
      <span>
        <span className="font-bold text-foreground">{head}</span>
        {destination.detail && `${separator}${destination.detail}`}
      </span>
    </span>
  )
}
