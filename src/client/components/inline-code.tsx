import { cn } from 'cn'
import type { ComponentProps } from 'react'

/** A sample value or literal shown in running text, framed like the input that produces it. */
export function InlineCode({ className, ...props }: ComponentProps<'code'>) {
  return (
    <code
      className={cn(
        'rounded-md border-2 border-border bg-accent px-1.5 py-px font-mono text-foreground',
        className,
      )}
      {...props}
    />
  )
}
