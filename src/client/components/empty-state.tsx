import { cn } from 'cn'
import type { ReactNode } from 'react'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description: ReactNode
  className?: string
  children?: ReactNode
}

export function EmptyState({
  icon,
  title,
  description,
  className,
  children,
}: EmptyStateProps) {
  return (
    <Empty className={cn('border', className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {children && <EmptyContent>{children}</EmptyContent>}
    </Empty>
  )
}
