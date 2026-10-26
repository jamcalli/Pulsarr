import { cn } from 'cn'
import {
  DRAGGING_CLASSES,
  DragHandle,
  DragHandleFace,
} from '@/components/drag-handle'
import { StatusPill } from '@/components/status-pill'
import { KanbanItem } from '@/components/ui/kanban'
import { formatNumber } from '@/lib/format'

const TILE =
  'flex min-h-12 items-center gap-2 rounded-md border-2 border-border bg-surface py-1 pr-3 pl-1'

export interface ReorderRouteView {
  id: number
  name: string
  rank: number
  instanceName: string
  enabled: boolean
}

function TileBody({ route }: { route: ReorderRouteView }) {
  return (
    <>
      <span className="w-6 shrink-0 text-center font-bold tabular-nums">
        {formatNumber(route.rank)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span
          className={cn(
            'truncate font-medium',
            !route.enabled && 'text-muted-foreground',
          )}
        >
          {route.name}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {route.instanceName}
        </span>
      </div>
      {!route.enabled && <StatusPill tone="off" label="Off" />}
    </>
  )
}

export function ReorderRouteTile({ route }: { route: ReorderRouteView }) {
  return (
    <KanbanItem value={route.id} className={cn(TILE, DRAGGING_CLASSES)}>
      <DragHandle
        size="sm"
        label={`Move ${route.name}, rank ${formatNumber(route.rank)}`}
      />
      <TileBody route={route} />
    </KanbanItem>
  )
}

/** Plain markup for the drag overlay, since a KanbanItem there would render as the drag placeholder. */
export function ReorderRouteTileFace({ route }: { route: ReorderRouteView }) {
  return (
    <div className={cn(TILE, 'shadow-shadow')}>
      <DragHandleFace size="sm" lifted />
      <TileBody route={route} />
    </div>
  )
}
