import type * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Renders a textarea element with consistent styling and support for all standard textarea attributes.
 *
 * Applies predefined styles for focus, selection, and disabled states, while allowing additional custom classes via the `className` prop.
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
