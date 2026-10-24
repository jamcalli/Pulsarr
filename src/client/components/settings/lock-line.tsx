import { Lock } from 'lucide-react'
import type { ReactNode } from 'react'

export function LockLine({
  reason,
  action,
}: {
  reason: string
  action?: ReactNode
}) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <Lock className="size-4 shrink-0" />
      <span className="flex-1">{reason}</span>
      {action}
    </div>
  )
}
