import { cn } from 'cn'
import type * as React from 'react'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex field-sizing-content min-h-16 w-full rounded-md border-2 border-border bg-inset px-2.5 py-2 text-base text-foreground transition-colors placeholder:text-muted-foreground outline-foreground/50 focus-visible:outline-3 focus-visible:outline-offset-0 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:text-sm',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
