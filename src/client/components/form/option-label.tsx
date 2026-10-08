import type { ReactNode } from 'react'

interface OptionLabelProps {
  description?: string
  children: ReactNode
}

export function OptionLabel({ description, children }: OptionLabelProps) {
  if (!description) return children
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="flex items-center gap-2">{children}</span>
      <span className="whitespace-normal text-muted-foreground text-xs">
        {description}
      </span>
    </span>
  )
}
