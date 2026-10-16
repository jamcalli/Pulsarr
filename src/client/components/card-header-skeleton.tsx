import type { ReactNode } from 'react'
import { CardHeaderWithActions } from '@/components/card-header-with-actions'
import { CardAction, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

interface CardHeaderSkeletonProps {
  description?: boolean
  badge?: boolean
  action?: ReactNode
  /** One button placeholder per width class, for a header drawn with `CardHeaderWithActions`. */
  buttons?: readonly string[]
}

export function CardHeaderSkeleton({
  description = false,
  badge = false,
  action,
  buttons = [],
}: CardHeaderSkeletonProps) {
  const title = <Skeleton className="h-5 w-36" />
  const heading = (
    <>
      {badge ? (
        <div className="flex items-center gap-2">
          {title}
          <Skeleton className="h-6 w-10" />
        </div>
      ) : (
        title
      )}
      {description && <Skeleton className="h-4 w-64 max-w-full" />}
    </>
  )
  if (buttons.length > 0) {
    return (
      <CardHeaderWithActions
        actions={buttons.map((width, index) => (
          <Skeleton key={`button-${index}`} className={`h-8 ${width}`} />
        ))}
      >
        {heading}
      </CardHeaderWithActions>
    )
  }
  return (
    <CardHeader>
      {heading}
      {action && <CardAction>{action}</CardAction>}
    </CardHeader>
  )
}
