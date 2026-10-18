import { cn } from 'cn'
import { Info, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

const CONTAINER = 'flex flex-col gap-x-4 gap-y-2.5 md:flex-row md:items-center'

interface InfoLineProps {
  icon?: LucideIcon
  tone?: 'info' | 'warn'
  children: ReactNode
  action?: ReactNode
}

export function InfoLine({
  icon: Icon = Info,
  tone = 'info',
  children,
  action,
}: InfoLineProps) {
  return (
    <div className={CONTAINER}>
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <Icon
          aria-hidden
          className={cn(
            'mt-0.5 size-4 shrink-0',
            tone === 'warn' ? 'text-gold' : 'text-info',
          )}
        />
        <span className="text-pretty">{children}</span>
      </div>
      {action && <div className="flex">{action}</div>}
    </div>
  )
}

export function InfoLineSkeleton() {
  return (
    <div className={CONTAINER}>
      <Skeleton className="h-5 w-full max-w-xl" />
      <Skeleton className="h-5 w-32" />
    </div>
  )
}
