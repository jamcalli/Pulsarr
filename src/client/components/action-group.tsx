import { cn } from 'cn'
import type { ReactNode } from 'react'

/** A row of buttons that share the full width at touch height on phones. */
export function ActionGroup({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap gap-2 max-md:w-full max-md:*:h-10 max-md:*:flex-1',
        className,
      )}
    >
      {children}
    </div>
  )
}
