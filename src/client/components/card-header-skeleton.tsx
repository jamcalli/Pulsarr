import type { ReactNode } from 'react'
import { CardAction, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

interface CardHeaderSkeletonProps {
  description?: boolean
  badge?: boolean
  action?: ReactNode
}

export function CardHeaderSkeleton({
  description = false,
  badge = false,
  action,
}: CardHeaderSkeletonProps) {
  const title = <Skeleton className="h-5 w-36" />
  return (
    <CardHeader>
      {badge ? (
        <div className="flex items-center gap-2">
          {title}
          <Skeleton className="h-6 w-10" />
        </div>
      ) : (
        title
      )}
      {description && <Skeleton className="h-4 w-64 max-w-full" />}
      {action && <CardAction>{action}</CardAction>}
    </CardHeader>
  )
}
