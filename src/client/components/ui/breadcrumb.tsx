import { Slot } from "@radix-ui/react-slot"
import { ChevronRight, MoreHorizontal } from "lucide-react"

import type * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Renders a navigation container for breadcrumb links with ARIA labeling for accessibility.
 *
 * Spreads additional props onto the underlying `<nav>` element.
 */
function Breadcrumb({ ...props }: React.ComponentProps<"nav">) {
  return <nav data-slot="breadcrumb" aria-label="breadcrumb" {...props} />
}

/**
 * Renders an ordered list (`<ol>`) for breadcrumb items with horizontal flex layout and customizable styling.
 *
 * Accepts additional class names and HTML attributes for further customization.
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
 * Renders an individual breadcrumb item as a styled list element.
 *
 * Accepts all standard `<li>` props and merges custom class names with default inline-flex styling.
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
 * Renders a breadcrumb link as either an anchor element or a custom child component.
 *
 * If `asChild` is true, the link is rendered using the provided child component via the `Slot` utility; otherwise, it renders a standard `<a>` element.
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
 * Renders a span indicating the current page in a breadcrumb navigation.
 *
 * The element is marked with `aria-current="page"` for accessibility and accepts additional class names and span props.
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
 * Renders a decorative separator between breadcrumb items, using a chevron icon by default or custom content if provided.
 *
 * The separator is hidden from assistive technologies and marked as presentational.
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
 * Displays a horizontal ellipsis icon with a hidden "More" label for screen readers to enhance accessibility.
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
