import { Badge, type BadgeVariant } from '@/components/ui/badge'

export type StatusTone =
  | 'pending'
  | 'requested'
  | 'available'
  | 'failed'
  | 'on'
  | 'off'

const TONE_VARIANTS: Record<StatusTone, BadgeVariant> = {
  pending: 'warn',
  requested: 'info',
  available: 'ok',
  failed: 'destructive',
  on: 'ok',
  off: 'outline',
}

interface StatusPillProps {
  tone: StatusTone
  label: string
  detail?: string
}

export function StatusPill({ tone, label, detail }: StatusPillProps) {
  const pill = <Badge variant={TONE_VARIANTS[tone]}>{label}</Badge>
  if (!detail) return pill
  return (
    <span className="inline-flex shrink-0 items-center gap-2 text-xs">
      {pill}
      <span className="text-muted-foreground">{detail}</span>
    </span>
  )
}
