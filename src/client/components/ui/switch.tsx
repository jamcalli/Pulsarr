import * as SwitchPrimitives from "@radix-ui/react-switch"
import * as React from "react"
import { cn } from "@/lib/utils"

// Define variant types
type SwitchVariant = "default" | "success" | "danger" | "warning" | "info"

// Extend the props to include our new variant prop
interface SwitchProps extends React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root> {
  variant?: SwitchVariant
}

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  SwitchProps
>(({ className, variant = "default", ...props }, ref) => {
  // Define variant color classes
  const variantClasses = {
    default: "data-[state=checked]:bg-main",
    success: "data-[state=checked]:bg-green-500",
    danger: "data-[state=checked]:bg-error",
    warning: "data-[state=checked]:bg-yellow-500",
    info: "data-[state=checked]:bg-blue-500",
  }

  return (
    <SwitchPrimitives.Root
      className={cn(
        "peer inline-flex h-6 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-border transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-50 data-[state=unchecked]:bg-secondary-background",
        variantClasses[variant],
        className,
      )}
      {...props}
      ref={ref}
    >
      <SwitchPrimitives.Thumb
        className={cn(
          "pointer-events-none block h-4 w-4 rounded-full border-2 border-border bg-white ring-0 transition-transform data-[state=checked]:translate-x-6 data-[state=unchecked]:translate-x-1",
        )}
      />
    </SwitchPrimitives.Root>
  )
})
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
export type { SwitchVariant, SwitchProps }