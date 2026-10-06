import { cn } from 'cn'
import { Hourglass } from 'lucide-react'

interface ApprovalExpiryProps {
  text: string
  soon: boolean
  className?: string
}

export function ApprovalExpiry({ text, soon, className }: ApprovalExpiryProps) {
  if (!soon) {
    return <p className={cn('text-muted-foreground', className)}>{text}</p>
  }
  return (
    <p className={cn('flex items-center gap-1.5', className)}>
      <Hourglass className="size-4 shrink-0 text-status-pending" />
      <span className="truncate">{text}</span>
    </p>
  )
}
