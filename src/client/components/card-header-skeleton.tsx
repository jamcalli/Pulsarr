import type { ReactNode } from 'react'
import { CardAction, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

interface CardHeaderSkeletonProps {
  description?: boolean
  action?: ReactNode
}

export function CardHeaderSkeleton({
  description = false,
  action,
}: CardHeaderSkeletonProps) {
  return (
    <CardHeader>
      <Skeleton className="h-5 w-36" />
      {description && <Skeleton className="h-4 w-64 max-w-full" />}
      {action && <CardAction>{action}</CardAction>}
    </CardHeader>
  )
}
