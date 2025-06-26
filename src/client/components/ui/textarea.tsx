import type * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Renders a textarea element with predefined styling and support for additional class names and standard textarea attributes.
 *
 * The component ensures consistent appearance across states such as focus, selection, and disabled, while allowing further customization through the `className` prop.
 */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-[80px] w-full rounded-base border-2 border-border bg-secondary-background selection:bg-main selection:text-main-foreground px-3 py-2 text-sm font-base text-foreground placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
