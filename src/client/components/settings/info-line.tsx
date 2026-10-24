import { cn } from 'cn'
import { CircleAlert, Info, type LucideIcon, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

const CONTAINER = 'flex flex-col gap-x-4 gap-y-2.5 md:flex-row md:items-center'

type InfoLineTone = 'info' | 'warn' | 'danger'

const TONES: Record<InfoLineTone, { icon: LucideIcon; className: string }> = {
  info: { icon: Info, className: 'text-info' },
  warn: { icon: TriangleAlert, className: 'text-gold' },
  danger: { icon: CircleAlert, className: 'text-destructive' },
}

interface InfoLineProps {
  /** Defaults to the tone's own icon. */
  icon?: LucideIcon
  tone?: InfoLineTone
  children: ReactNode
  action?: ReactNode
}

export function InfoLine({
  icon,
  tone = 'info',
  children,
  action,
}: InfoLineProps) {
  const Icon = icon ?? TONES[tone].icon

  return (
    <div className={CONTAINER}>
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <Icon
          aria-hidden
          className={cn('mt-0.5 size-4 shrink-0', TONES[tone].className)}
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
