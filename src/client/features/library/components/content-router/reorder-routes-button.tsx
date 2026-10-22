import { lazy, Suspense, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { RouteTargets } from '@/features/library/hooks/content-router/useRouteTargets'
import type { RouteType } from '@/features/library/lib/content-router/condition-fields'
import type { components } from '@/types/api.js'

type RouterRule = components['schemas']['RouterRule']

const ReorderRoutesDialog = lazy(
  () =>
    import(
      '@/features/library/components/content-router/reorder-routes-dialog'
    ),
)

interface ReorderRoutesButtonProps {
  type: RouteType
  routes: RouterRule[]
  targets: RouteTargets
  disabled: boolean
  open: boolean
  /** Asks first while a route editor has unsaved changes. */
  onOpen: () => void
  onOpenChange: (open: boolean) => void
}

export function ReorderRoutesButton({
  type,
  routes,
  targets,
  disabled,
  open,
  onOpen,
  onOpenChange,
}: ReorderRoutesButtonProps) {
  const [opened, setOpened] = useState(false)
  const [session, setSession] = useState(0)
  const openDialog = () => {
    setOpened(true)
    setSession((count) => count + 1)
    onOpen()
  }
  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={openDialog}
      >
        Reorder
      </Button>
      {opened && (
        <Suspense fallback={null}>
          <ReorderRoutesDialog
            key={session}
            type={type}
            routes={routes}
            targets={targets}
            open={open}
            onOpenChange={onOpenChange}
          />
        </Suspense>
      )}
    </>
  )
}
