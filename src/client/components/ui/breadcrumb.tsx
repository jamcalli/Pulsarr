import { Slot } from "@radix-ui/react-slot"
import { ChevronRight, MoreHorizontal } from "lucide-react"

import type * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Renders a navigation region for breadcrumb links with appropriate ARIA labeling for accessibility.
 *
 * Spreads any additional props onto the underlying `<nav>` element.
 */
function Breadcrumb({ ...props }: React.ComponentProps<"nav">) {
  return <nav data-slot="breadcrumb" aria-label="breadcrumb" {...props} />
}

/**
 * Renders an ordered list for breadcrumb items with horizontal flex layout and customizable styling.
 *
 * Additional class names and HTML attributes can be provided to further customize the breadcrumb list.
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
 * Renders a breadcrumb item as a list element with inline-flex styling.
 *
 * Accepts additional class names and all standard `<li>` props.
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
 * Renders a breadcrumb link as either a standard anchor element or a custom child component.
 *
 * If `asChild` is true, uses the `Slot` utility to render the link with a custom component; otherwise, renders an `<a>` element.
 *
 * @param asChild - If true, renders the link using a custom child component instead of an anchor element.
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
 * Renders a span representing the current page in a breadcrumb trail.
 *
 * Sets `aria-current="page"` for accessibility and allows additional class names and span attributes.
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
 * Renders a decorative separator between breadcrumb items, defaulting to a chevron icon unless custom content is provided.
 *
 * The separator is marked as presentational and hidden from assistive technologies.
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
 * Renders an ellipsis indicator for truncated breadcrumb items.
 *
 * Displays a horizontal ellipsis icon and includes a visually hidden "More" label for screen readers to improve accessibility.
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
