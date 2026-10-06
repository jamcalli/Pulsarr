import { cn } from 'cn'
import { ArrowRight, Power, ScrollText } from 'lucide-react'
import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { BusyLabel } from '@/components/busy-label'
import { ErrorAlert } from '@/components/error-alert'
import { Button } from '@/components/ui/button'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from '@/components/ui/item'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { type SyncControls, useSyncControls } from '@/hooks/useSyncControls'
import { useSyncStatus } from '@/hooks/useSyncStatus'
import { NAV_PAGES, pageHref } from '@/lib/navigation'
import {
  SYNC_ACTION_LABELS,
  SYNC_MODE_LABELS,
  type SyncState,
  type SyncStatus,
  syncControlFor,
  syncStateLabel,
} from '@/lib/sync-status'

const DOT_CLASSES: Record<SyncState, string> = {
  running: 'bg-ok',
  starting: 'bg-gold',
  stopping: 'bg-gold',
  stopped: 'bg-destructive',
}

function SyncDot({ state }: { state: SyncState | null }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'size-2 shrink-0 rounded-full',
        state ? DOT_CLASSES[state] : 'bg-muted-foreground',
      )}
    />
  )
}

function SyncPanel({
  status,
  controls,
  onNavigate,
}: {
  status: SyncStatus
  controls: SyncControls
  onNavigate: () => void
}) {
  const { state, mode } = status
  const autoStartId = useId()
  const control = syncControlFor(state)
  const busy = Boolean(control?.busy) || controls.isToggling
  const labels = control && SYNC_ACTION_LABELS[control.action]

  return (
    <>
      <Item>
        <ItemContent>
          <PopoverTitle render={<ItemTitle className="text-base font-bold" />}>
            Watchlist sync
          </PopoverTitle>
          <ItemDescription className="flex items-center gap-1.5">
            <SyncDot state={state} />
            <span className="truncate">
              <span className="text-foreground capitalize">
                {syncStateLabel(state)}
              </span>
              {mode && `, ${SYNC_MODE_LABELS[mode]}`}
            </span>
          </ItemDescription>
        </ItemContent>
        {control && labels && (
          <ItemActions>
            <Button
              variant="neutral"
              size="sm"
              aria-label={labels.full}
              disabled={busy}
              onClick={() => controls.run(control.action)}
            >
              <BusyLabel
                busy={busy}
                label={labels.idle}
                busyLabel={labels.busy}
              />
            </Button>
          </ItemActions>
        )}
      </Item>
      <ItemSeparator className="my-0" />
      <ItemGroup className="gap-0 p-1.5">
        <ErrorAlert message={controls.toggleErrorMessage} />
        <ErrorAlert message={controls.autoStartErrorMessage} />
        <Item size="sm">
          <ItemMedia variant="icon" className="text-muted-foreground">
            <Power />
          </ItemMedia>
          <ItemContent>
            <Label htmlFor={autoStartId} className="font-medium">
              Start on launch
            </Label>
          </ItemContent>
          <ItemActions>
            <Switch
              id={autoStartId}
              size="sm"
              checked={controls.autoStartEnabled}
              onCheckedChange={controls.setAutoStart}
              disabled={!controls.autoStartReady || controls.isSavingAutoStart}
            />
          </ItemActions>
        </Item>
        <Item
          size="sm"
          render={<Link to={pageHref(NAV_PAGES.logs)} onClick={onNavigate} />}
        >
          <ItemMedia variant="icon" className="text-muted-foreground">
            <ScrollText />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>View logs</ItemTitle>
          </ItemContent>
          <ItemActions className="text-muted-foreground">
            <ArrowRight className="size-4" />
          </ItemActions>
        </Item>
      </ItemGroup>
    </>
  )
}

export function SidebarSyncStatus() {
  const status = useSyncStatus()
  const controls = useSyncControls()
  const { setOpenMobile } = useSidebar()
  const [open, setOpen] = useState(false)

  const closeAll = () => {
    setOpen(false)
    setOpenMobile(false)
  }

  return (
    <SidebarMenuItem>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <SidebarMenuButton
              size="lg"
              className="text-foreground aria-expanded:bg-accent"
            />
          }
        >
          {status.state ? (
            <>
              <SyncDot state={status.state} />
              <span className="flex-1">
                Sync {syncStateLabel(status.state)}
              </span>
            </>
          ) : (
            <>
              <Skeleton className="h-4 flex-1" />
              <span className="sr-only">Loading sync status</span>
            </>
          )}
          {status.mode && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {SYNC_MODE_LABELS[status.mode]}
            </span>
          )}
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="start"
          sideOffset={8}
          className="w-70 max-w-(--available-width) gap-0 overflow-hidden p-0"
        >
          <SyncPanel
            status={status}
            controls={controls}
            onNavigate={closeAll}
          />
        </PopoverContent>
      </Popover>
    </SidebarMenuItem>
  )
}
