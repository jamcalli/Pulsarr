import type { ReactNode } from 'react'
import { ActionGroup } from '@/components/action-group'
import { CardAction, CardHeader } from '@/components/ui/card'

/** A card header whose buttons sit beside the title, and drop under it sharing the width on phones. */
export function CardHeaderWithActions({
  actions,
  children,
}: {
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <CardHeader className="max-md:has-data-[slot=card-action]:grid-cols-1">
      {children}
      {actions && (
        <CardAction className="max-md:col-span-full max-md:col-start-1 max-md:row-span-1 max-md:row-start-auto max-md:mt-2 max-md:justify-self-stretch">
          <ActionGroup>{actions}</ActionGroup>
        </CardAction>
      )}
    </CardHeader>
  )
}
