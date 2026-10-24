import { cn } from 'cn'
import { GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { KanbanItemHandle } from '@/components/ui/kanban'

export const DRAGGING_CLASSES =
  'data-dragging:border-dashed data-dragging:border-primary data-dragging:bg-accent data-dragging:opacity-100 data-dragging:*:invisible'

const SIZES = {
  xs: { button: 'icon-xs', face: 'size-6', grip: 'size-3' },
  sm: { button: 'icon-sm', face: 'size-8', grip: 'size-4' },
} as const

type DragHandleSize = keyof typeof SIZES

export function DragHandle({
  label,
  size = 'xs',
}: {
  label: string
  size?: DragHandleSize
}) {
  return (
    <KanbanItemHandle
      aria-label={label}
      render={<Button variant="ghost" size={SIZES[size].button} />}
    >
      <GripVertical className={SIZES[size].grip} />
    </KanbanItemHandle>
  )
}

export function DragHandleFace({
  lifted,
  size = 'xs',
  className,
}: {
  lifted?: boolean
  size?: DragHandleSize
  className?: string
}) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-md text-muted-foreground',
        SIZES[size].face,
        lifted && 'bg-accent',
        className,
      )}
    >
      <GripVertical className={SIZES[size].grip} />
    </span>
  )
}
