import * as AvatarPrimitive from "@radix-ui/react-avatar"

import type * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Renders a circular avatar container with default styling, wrapping the Radix UI Avatar root.
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
 * Displays an avatar image that fills its container and maintains a square aspect ratio.
 *
 * Merges default and custom class names, and includes a data attribute for targeting.
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
 * Displays a styled fallback UI for the avatar when the image is unavailable.
 *
 * Merges default centering, background, and text styles with any additional class names.
 */
function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "flex size-full items-center justify-center rounded-full bg-secondary-background text-foreground font-base",
        className,
      )}
      {...props}
    />
  )
}

export { Avatar, AvatarImage, AvatarFallback }
