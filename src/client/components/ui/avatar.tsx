import * as AvatarPrimitive from "@radix-ui/react-avatar"

import type * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Displays a circular avatar container with default styling, wrapping the Radix UI Avatar root.
 *
 * Merges custom class names with default styles and forwards all additional props to the underlying primitive.
 */
function Avatar({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        "relative flex size-10 shrink-0 overflow-hidden rounded-full outline-2 outline-border",
        className,
      )}
      {...props}
    />
  )
}

/**
 * Renders an avatar image that fills its container and preserves a square aspect ratio.
 *
 * Combines default and custom class names, and adds a `data-slot="avatar-image"` attribute for targeting. All additional props are forwarded to the underlying Radix UI primitive.
 */
function AvatarImage({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full", className)}
      {...props}
    />
  )
}

/**
 * Renders a fallback UI centered within the avatar container when the avatar image cannot be displayed.
 *
 * Combines default centering, background, and text styles with any custom class names. Forwards all additional props to the underlying Radix UI primitive.
 */
function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "flex size-full items-center justify-center rounded-full bg-secondary-background text-foreground text-base",
        className,
      )}
      {...props}
    />
  )
}

export { Avatar, AvatarImage, AvatarFallback }
