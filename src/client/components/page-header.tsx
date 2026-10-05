import { cn } from 'cn'
import type { ReactNode } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

export function Page({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'mx-auto flex w-full max-w-220 flex-col gap-5 px-4 pt-7 pb-8 md:px-8',
        className,
      )}
    >
      {children}
    </div>
  )
}

interface PageHeaderProps {
  section?: string
  title: string
  description?: ReactNode
  action?: ReactNode
}

export function PageHeader({
  section,
  title,
  description,
  action,
}: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {section && (
          <div className="text-sm text-muted-foreground">{section}</div>
        )}
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-pretty text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  )
}

export function PageSkeleton() {
  return (
    <Page>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-5 w-80 max-w-full" />
      </div>
      <Skeleton className="h-48 w-full rounded-lg" />
    </Page>
  )
}
