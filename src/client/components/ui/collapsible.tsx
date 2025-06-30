import * as CollapsiblePrimitive from "@radix-ui/react-collapsible"

import type * as React from "react"

/**
 * A React component that renders a collapsible container using Radix UI's Collapsible primitive.
 *
 * Forwards all props to the underlying Radix component and adds a `data-slot="collapsible"` attribute for targeting or styling.
 */
function Collapsible({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

/**
 * A React component that renders a collapsible trigger, forwarding all props to the underlying Radix UI primitive and adding a `data-slot="collapsible-trigger"` attribute.
 */
function CollapsibleTrigger({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>) {
  return (
    <CollapsiblePrimitive.CollapsibleTrigger
      data-slot="collapsible-trigger"
      {...props}
    />
  )
}

/**
 * A React component that renders collapsible content using the Radix UI primitive, with an added data attribute for styling or querying.
 */
function CollapsibleContent({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>) {
  return (
    <CollapsiblePrimitive.CollapsibleContent
      data-slot="collapsible-content"
      {...props}
    />
  )
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
