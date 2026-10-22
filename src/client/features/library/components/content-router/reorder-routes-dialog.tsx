import { useMutation } from '@tanstack/react-query'
import { Ban } from 'lucide-react'
import { useState } from 'react'
import { BusyLabel } from '@/components/busy-label'
import { ErrorAlert } from '@/components/error-alert'
import { ScrollBody } from '@/components/scroll-body'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Item, ItemGroup, ItemMedia } from '@/components/ui/item'
import {
  Kanban,
  KanbanBoard,
  KanbanColumn,
  KanbanOverlay,
} from '@/components/ui/kanban'
import {
  ReorderRouteTile,
  ReorderRouteTileFace,
  type ReorderRouteView,
} from '@/features/library/components/content-router/reorder-route-tile'
import { reorderRules } from '@/features/library/hooks/content-router/useContentRouterRules'
import type { RouteTargets } from '@/features/library/hooks/content-router/useRouteTargets'
import type { RouteType } from '@/features/library/lib/content-router/condition-fields'
import { routeAnnouncements } from '@/features/library/lib/content-router/route-announcements'
import {
  orderAssignments,
  routesLabel,
} from '@/features/library/lib/content-router/route-list'
import { useMinLoadingMutation, withMinDuration } from '@/hooks/useMinLoading'
import { mutationErrorMessage } from '@/lib/tanstackApi'
import type { components } from '@/types/api.js'

type RouterRule = components['schemas']['RouterRule']

const COLUMN = 'routes'

interface ReorderRoutesDialogProps {
  type: RouteType
  /** In evaluated order, exclude rules first. */
  routes: RouterRule[]
  targets: RouteTargets
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function ReorderRoutesDialog({
  type,
  routes,
  targets,
  open,
  onOpenChange,
}: ReorderRoutesDialogProps) {
  const pinned = routes.filter((rule) => rule.exclude_from_routing)
  const movable = routes.filter((rule) => !rule.exclude_from_routing)
  const [initialIds] = useState(() => movable.map((rule) => rule.id))
  const [orderedIds, setOrderedIds] = useState(initialIds)
  const save = useMinLoadingMutation(
    useMutation({
      mutationFn: (orders: ReadonlyArray<{ id: number; order: number }>) =>
        withMinDuration(reorderRules(orders)),
      onSuccess: () => onOpenChange(false),
    }),
  )

  const byId = new Map(movable.map((rule) => [rule.id, rule]))
  const ordered = orderedIds.flatMap((id) => byId.get(id) ?? [])
  const views: ReorderRouteView[] = ordered.map((rule, index) => {
    const destination = targets.ruleDestination(rule)
    return {
      id: rule.id,
      name: rule.name,
      rank: index + 1,
      instanceName:
        destination.kind === 'instance' ? destination.name : 'Not routed',
      enabled: rule.enabled ?? true,
    }
  })
  const names = new Map(ordered.map((rule) => [rule.id, rule.name]))
  const moved = orderedIds.some((id, index) => id !== initialIds[index])
  const changes = orderAssignments(orderedIds, routes)
  const errorMessage = save.error
    ? mutationErrorMessage(save.error, 'The order was not saved. Try again.')
    : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col max-sm:p-4 md:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Reorder {routesLabel(type)}</DialogTitle>
          <DialogDescription>
            The route nearer the top wins a shared instance and decides
            approval.
          </DialogDescription>
        </DialogHeader>
        <ScrollBody inset="dialog" className="flex flex-col gap-4">
          {pinned.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="pt-1 font-medium text-muted-foreground">
                Always first
              </h3>
              <ItemGroup role="list" aria-label="Routes that always run first">
                {pinned.map((rule) => (
                  <Item
                    key={rule.id}
                    role="listitem"
                    variant="outline"
                    size="sm"
                    className="rounded-md border-dashed pl-1.5"
                  >
                    <ItemMedia className="w-8 text-muted-foreground">
                      <Ban aria-hidden className="size-4" />
                    </ItemMedia>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">{rule.name}</span>
                      <span className="text-xs text-muted-foreground">
                        Runs before every route below.
                      </span>
                    </div>
                  </Item>
                ))}
              </ItemGroup>
            </section>
          )}
          <section className="flex flex-col gap-2">
            {pinned.length > 0 && (
              <h3 className="pt-1 font-medium text-muted-foreground">
                Then in this order
              </h3>
            )}
            <Kanban
              value={{ [COLUMN]: orderedIds }}
              onValueChange={(columns) => {
                const next = columns[COLUMN]
                if (next) setOrderedIds(next)
              }}
              orientation="vertical"
              accessibility={{
                announcements: routeAnnouncements(orderedIds, names),
              }}
            >
              <KanbanBoard className="flex flex-col gap-1">
                <KanbanColumn
                  value={COLUMN}
                  className="gap-1 border-transparent bg-transparent p-0"
                >
                  {views.map((route) => (
                    <ReorderRouteTile key={route.id} route={route} />
                  ))}
                </KanbanColumn>
              </KanbanBoard>
              <KanbanOverlay>
                {({ value }) => {
                  const route = views.find((view) => view.id === value)
                  return route ? <ReorderRouteTileFace route={route} /> : null
                }}
              </KanbanOverlay>
            </Kanban>
          </section>
        </ScrollBody>
        <ErrorAlert message={errorMessage} />
        <DialogFooter className="max-sm:flex-row max-sm:*:flex-1">
          <DialogClose
            render={
              <Button
                type="button"
                variant="outline"
                disabled={save.isPending}
              />
            }
          >
            Cancel
          </DialogClose>
          <Button
            type="button"
            disabled={!moved || changes.length === 0 || save.isPending}
            onClick={() => save.mutate(changes)}
          >
            <BusyLabel
              busy={save.isPending}
              label="Save order"
              busyLabel="Saving..."
            />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
