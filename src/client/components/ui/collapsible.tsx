import * as CollapsiblePrimitive from "@radix-ui/react-collapsible"

import type * as React from "react"

/**
 * Renders a collapsible container using Radix UI's Collapsible primitive, forwarding all props and adding a `data-slot="collapsible"` attribute.
 */
function Collapsible({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

/**
 * Renders a trigger element for toggling the collapsible state, forwarding all props to the Radix UI primitive and adding a `data-slot="collapsible-trigger"` attribute.
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
 * Renders the collapsible content area using the Radix UI primitive, adding a `data-slot="collapsible-content"` attribute for styling or targeting.
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
