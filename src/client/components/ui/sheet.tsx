"use client"

import * as SheetPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import type * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Provides the root container for the Sheet dialog, managing its open state and context for nested Sheet components.
 *
 * Forwards all props to the underlying SheetPrimitive.Root and adds a `data-slot="sheet"` attribute.
 */
function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

/**
 * Renders an element that triggers the opening of the sheet dialog.
 *
 * Forwards all props to the underlying trigger primitive and adds a `data-slot="sheet-trigger"` attribute.
 */
function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

/**
 * Renders a close button for the Sheet dialog.
 *
 * Forwards all props to the underlying primitive and adds a `data-slot="sheet-close"` attribute for styling or testing.
 */
function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

/**
 * Renders the Sheet dialog content inside a React portal, enabling it to be mounted outside the main DOM hierarchy.
 *
 * Forwards all props to the underlying portal primitive and adds a `data-slot="sheet-portal"` attribute.
 */
function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

/**
 * Renders a full-screen overlay behind the Sheet dialog with animated transitions for open and closed states.
 *
 * The overlay dims the background and visually separates the Sheet from the rest of the UI. Additional class names can be merged via the `className` prop.
 */
function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-overlay",
        className,
      )}
      {...props}
    />
  )
}

/**
 * Renders the main content area of the Sheet dialog with animated slide-in and slide-out transitions from a specified edge.
 *
 * The content is displayed inside a portal with an overlay and includes a close button in the top-right corner. The `side` prop determines the edge ("top", "bottom", "left", or "right") from which the Sheet appears.
 *
 * @param side - Specifies the edge of the screen from which the Sheet slides in.
 */
function SheetContent({
  className,
  children,
  side = "right",
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "bottom" | "left" | "right"
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out fixed z-50 flex flex-col gap-4 p-6 border-2 border-border transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
          side === "right" &&
            "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm",
          side === "left" &&
            "data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm",
          side === "top" &&
            "data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top inset-x-0 top-0 h-auto border-b",
          side === "bottom" &&
            "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom inset-x-0 bottom-0 h-auto border-t",
          className,
        )}
        {...props}
      >
        {children}
        <SheetPrimitive.Close className="absolute right-4 top-4 rounded-base ring-offset-white focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

/**
 * Renders the header section of the Sheet dialog with vertical layout, gap, and padding.
 *
 * Accepts additional class names via the `className` prop for custom styling and forwards other props to the underlying `div`.
 */
function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 p-4", className)}
      {...props}
    />
  )
}

/**
 * Renders the footer section of the Sheet dialog with vertical layout, spacing, and padding.
 *
 * Positions its content at the bottom of the Sheet and allows additional class names and props to be applied.
 */
function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-3 p-4", className)}
      {...props}
    />
  )
}

/**
 * Renders the title of the Sheet dialog with heading font and foreground color styling.
 *
 * Forwards all props and accepts additional class names, applying them to the underlying Radix UI title primitive.
 */
function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-foreground font-heading", className)}
      {...props}
    />
  )
}

/**
 * Renders descriptive text within the Sheet dialog with smaller font size and foreground color styling.
 *
 * Additional class names can be provided via the `className` prop. All other props are forwarded to the underlying primitive.
 */
function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-foreground font-base", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
