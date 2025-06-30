import * as AvatarPrimitive from "@radix-ui/react-avatar"

import type * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Renders a styled avatar container component, wrapping the Radix UI Avatar root.
 *
 * Combines default avatar layout, sizing, and border styles with any additional class names provided.
 * All other props are forwarded to the underlying Radix Avatar primitive.
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
 * Renders an avatar image that fills its container with a square aspect ratio.
 *
 * Combines default and custom class names, and adds a data attribute for targeting.
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
 * Renders a styled fallback element for the avatar, typically shown when the image cannot be loaded.
 *
 * Applies default centering, background, and text styles, and merges any additional class names provided.
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
