import { Badge, type BadgeVariant } from '@/components/ui/badge'

export type StatusTone =
  | 'pending'
  | 'warning'
  | 'requested'
  | 'available'
  | 'failed'
  | 'on'
  | 'off'

const TONE_VARIANTS: Record<StatusTone, BadgeVariant> = {
  pending: 'warn',
  warning: 'warn',
  requested: 'info',
  available: 'ok',
  failed: 'destructive',
  on: 'ok',
  off: 'outline',
}

export interface StatusPillView {
  tone: StatusTone
  label: string
}

interface StatusPillProps extends StatusPillView {
  detail?: string
  live?: boolean
}

export function StatusPill({ tone, label, detail, live }: StatusPillProps) {
  const badge = <Badge variant={TONE_VARIANTS[tone]}>{label}</Badge>
  const pill = detail ? (
    <span className="inline-flex shrink-0 items-center gap-2 text-xs">
      {badge}
      <span className="text-muted-foreground">{detail}</span>
    </span>
  ) : (
    badge
  )
  if (!live) return pill
  return (
    <span role="status" aria-live="polite">
      {pill}
    </span>
  )
}
