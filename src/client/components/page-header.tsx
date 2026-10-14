import { cn } from 'cn'
import type { ReactNode } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

const HEADER_ROW = 'flex flex-wrap items-start justify-between gap-4'

export function Page({
  className,
  wide = false,
  busy = false,
  children,
}: {
  className?: string
  wide?: boolean
  /** Marks the page as loading, for a page-shaped skeleton. */
  busy?: boolean
  children: ReactNode
}) {
  return (
    <div
      aria-busy={busy || undefined}
      className={cn(
        'mx-auto flex w-full flex-col gap-5 px-4 pt-7 pb-8 md:px-8',
        wide ? 'max-w-310' : 'max-w-220',
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
    <div className={HEADER_ROW}>
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

export function PageHeaderSkeleton({
  section = true,
  action,
}: {
  section?: boolean
  action?: ReactNode
}) {
  const header = (
    <div className="flex flex-col gap-2">
      {section && <Skeleton className="h-4 w-20" />}
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-5 w-80 max-w-full" />
    </div>
  )
  if (!action) return header
  return (
    <div className={HEADER_ROW}>
      {header}
      {action}
    </div>
  )
}

export function PageSkeleton({ wide = false }: { wide?: boolean }) {
  return (
    <Page wide={wide}>
      <PageHeaderSkeleton />
      <Skeleton className="h-48 w-full rounded-lg" />
    </Page>
  )
}
