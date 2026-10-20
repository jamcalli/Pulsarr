import { ScrollBody } from '@/components/scroll-body'
import { SeparatedList } from '@/components/separated-list'
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
import { Item } from '@/components/ui/item'
import { Kanban, KanbanBoard, KanbanOverlay } from '@/components/ui/kanban'
import { Separator } from '@/components/ui/separator'
import {
  LayoutRow,
  LayoutRowFace,
} from '@/features/home/components/customize/layout-row'
import { LayoutTileFace } from '@/features/home/components/customize/layout-tile'
import type { HomeLayoutState } from '@/features/home/hooks/useHomeLayout'
import {
  NEW_ROW_COLUMN,
  useLayoutBoard,
} from '@/features/home/hooks/useLayoutBoard'
import { useToggleFocus } from '@/features/home/hooks/useToggleFocus'
import { HOME_CARDS } from '@/features/home/lib/home-cards'
import { HOME_CARD_IDS, type HomeCardId } from '@/features/home/lib/home-layout'

interface CustomizeHomeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  homeLayout: HomeLayoutState
}

export default function CustomizeHomeDialog({
  open,
  onOpenChange,
  homeLayout,
}: CustomizeHomeDialogProps) {
  const { layout, setHidden, reset, isDefault } = homeLayout
  const { columns, draggingItem, ...boardHandlers } = useLayoutBoard(homeLayout)
  const { controlRef, focusNext } = useToggleFocus()
  const hide = (id: HomeCardId) => {
    focusNext('show', id)
    setHidden(id, true)
  }
  const show = (id: HomeCardId) => {
    focusNext('hide', id)
    setHidden(id, false)
  }
  const placed = layout.rows.flat()
  const hiddenCards = [...layout.hidden].sort(
    (a, b) => placed.indexOf(a) - placed.indexOf(b),
  )
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col max-sm:p-4 md:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Customize home</DialogTitle>
          <DialogDescription>
            Changes apply to Home as you make them.
          </DialogDescription>
        </DialogHeader>
        <ScrollBody inset="dialog" className="flex flex-col gap-4">
          <Kanban value={columns} orientation="vertical" {...boardHandlers}>
            <KanbanBoard className="flex flex-col gap-1">
              {Object.entries(columns).map(([value, cards]) => (
                <LayoutRow
                  key={value}
                  value={value}
                  cards={cards}
                  newRow={value === NEW_ROW_COLUMN}
                  onHide={hide}
                  hideRef={(id) => controlRef('hide', id)}
                />
              ))}
            </KanbanBoard>
            <KanbanOverlay>
              {({ value, variant }) => {
                if (variant === 'column') {
                  return <LayoutRowFace cards={columns[String(value)] ?? []} />
                }
                const id = HOME_CARD_IDS.find((card) => card === value)
                return id ? <LayoutTileFace id={id} lifted /> : null
              }}
            </KanbanOverlay>
          </Kanban>
          {hiddenCards.length > 0 && (
            <section className="flex flex-col gap-2">
              <Separator />
              <h3 className="pt-1 font-medium text-muted-foreground">Hidden</h3>
              <SeparatedList label="Hidden cards">
                {hiddenCards.map((id) => {
                  const { label } = HOME_CARDS[id]
                  return (
                    <Item
                      key={id}
                      role="listitem"
                      size="xs"
                      className="pl-9 max-sm:pl-8"
                    >
                      <span className="flex-1 truncate text-muted-foreground">
                        {label}
                      </span>
                      <Button
                        ref={controlRef('show', id)}
                        type="button"
                        variant="neutral"
                        size="xs"
                        aria-label={`Show ${label}`}
                        onClick={() => show(id)}
                      >
                        Show
                      </Button>
                    </Item>
                  )
                })}
              </SeparatedList>
            </section>
          )}
        </ScrollBody>
        <DialogFooter className="max-sm:flex-row max-sm:*:flex-1">
          <Button
            type="button"
            variant="outline"
            disabled={isDefault}
            onClick={reset}
          >
            Reset layout
          </Button>
          <DialogClose render={<Button type="button" />}>Done</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
