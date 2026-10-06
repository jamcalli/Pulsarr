import { cn } from 'cn'
import { Badge } from '@/components/ui/badge'

export type StatusTone =
  | 'pending'
  | 'requested'
  | 'available'
  | 'failed'
  | 'on'
  | 'off'

const TONE_FILL: Record<StatusTone, string> = {
  pending: 'bg-status-pending text-primary-foreground',
  requested: 'bg-status-requested text-primary-foreground',
  available: 'bg-status-available text-primary-foreground',
  failed: 'bg-status-failed text-primary-foreground',
  on: 'bg-ok text-primary-foreground',
  off: 'bg-inset',
}

interface StatusPillProps {
  tone: StatusTone
  label: string
  detail?: string
}

export function StatusPill({ tone, label, detail }: StatusPillProps) {
  const pill = (
    <Badge className={cn('border-border', TONE_FILL[tone])}>{label}</Badge>
  )
  if (!detail) return pill
  return (
    <span className="inline-flex shrink-0 items-center gap-2 text-xs">
      {pill}
      <span className="text-muted-foreground">{detail}</span>
    </span>
  )
}
