import { Slot } from "@radix-ui/react-slot"
import { ChevronRight, MoreHorizontal } from "lucide-react"

import type * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Renders a navigation container for breadcrumb links with appropriate ARIA labeling.
 *
 * Spreads additional props onto the underlying `<nav>` element.
 */
function Breadcrumb({ ...props }: React.ComponentProps<"nav">) {
  return <nav data-slot="breadcrumb" aria-label="breadcrumb" {...props} />
}

/**
 * Renders an ordered list for breadcrumb items with horizontal layout and styling.
 *
 * Additional class names and HTML attributes can be provided via props.
 */
function BreadcrumbList({ className, ...props }: React.ComponentProps<"ol">) {
  return (
    <ol
      data-slot="breadcrumb-list"
      className={cn(
        "flex flex-wrap items-center gap-1.5 text-sm font-base break-words text-foreground sm:gap-2.5",
        className,
      )}
      {...props}
    />
  )
}

/**
 * Renders a breadcrumb list item with appropriate styling and slot attribute.
 *
 * Accepts all standard `<li>` element props and merges additional class names with default styles.
 */
function BreadcrumbItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="breadcrumb-item"
      className={cn("inline-flex items-center gap-1.5", className)}
      {...props}
    />
  )
}

/**
 * Renders a breadcrumb link, optionally using a custom child component.
 *
 * If `asChild` is true, renders the child element using the `Slot` component; otherwise, renders an anchor (`<a>`) element.
 */
function BreadcrumbLink({
  asChild,
  className,
  ...props
}: React.ComponentProps<"a"> & {
  asChild?: boolean
}) {
  const Comp = asChild ? Slot : "a"

  return (
    <Comp data-slot="breadcrumb-link" className={cn(className)} {...props} />
  )
}

/**
 * Renders the current page indicator in a breadcrumb navigation.
 *
 * Displays a <span> element with appropriate ARIA attributes to mark it as the current page.
 */
function BreadcrumbPage({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="breadcrumb-page"
      aria-current="page"
      className={cn(className)}
      {...props}
    />
  )
}

/**
 * Renders a separator element between breadcrumb items, displaying a chevron icon by default.
 *
 * If `children` are provided, they are rendered instead of the default chevron icon.
 */
function BreadcrumbSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="breadcrumb-separator"
      role="presentation"
      aria-hidden="true"
      className={cn("[&>svg]:size-3.5", className)}
      {...props}
    >
      {children ?? <ChevronRight />}
    </li>
  )
}

/**
 * Renders an ellipsis indicator in the breadcrumb, typically used to represent collapsed or truncated breadcrumb items.
 *
 * Displays a horizontal ellipsis icon with a visually hidden "More" label for accessibility.
 */
function BreadcrumbEllipsis({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="breadcrumb-ellipsis"
      role="presentation"
      aria-hidden="true"
      className={cn("flex size-9 items-center justify-center", className)}
      {...props}
    >
      <MoreHorizontal className="size-4" />
      <span className="sr-only">More</span>
    </span>
  )
}

export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
}
