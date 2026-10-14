import { cn } from 'cn'
import type { ReactNode } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

interface StatTileProps {
  label: ReactNode
  /** Sits under the label, for a chart in place of a number. */
  children?: ReactNode
  value?: ReactNode
  /** Sits beside the value, for a share or a status pill. */
  detail?: ReactNode
  description?: ReactNode
  className?: string
}

export function StatTile({
  label,
  children,
  value,
  detail,
  description,
  className,
}: StatTileProps) {
  return (
    <div data-slot="stat-tile" className={cn('flex flex-col gap-1', className)}>
      <span className="flex items-center gap-2 font-medium">{label}</span>
      {value !== undefined && (
        <span className="flex flex-wrap items-baseline gap-2 tabular-nums">
          <span className="font-heading text-2xl font-bold">{value}</span>
          {detail && <span className="text-muted-foreground">{detail}</span>}
        </span>
      )}
      {children}
      {description && (
        <span className="text-xs text-muted-foreground">{description}</span>
      )}
    </div>
  )
}

export function StatTileSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-20" />
      <Skeleton className="h-3 w-40 max-w-full" />
    </div>
  )
}
