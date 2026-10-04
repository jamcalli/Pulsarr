import { cn } from 'cn'

interface StatusPillProps {
  state: 'on' | 'off'
  label: string
  detail?: string
}

export function StatusPill({ state, label, detail }: StatusPillProps) {
  return (
    <span className="inline-flex shrink-0 items-center gap-2 text-xs">
      <span
        className={cn(
          'inline-flex h-7 items-center rounded-md border-2 border-border px-2.5 font-bold whitespace-nowrap',
          state === 'on' ? 'bg-ok text-primary-foreground' : 'bg-inset',
        )}
      >
        {label}
      </span>
      {detail && <span className="text-muted-foreground">{detail}</span>}
    </span>
  )
}
