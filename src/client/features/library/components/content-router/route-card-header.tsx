import { cn } from 'cn'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { StatusPill } from '@/components/status-pill'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { RouteDestinationLine } from '@/features/library/components/content-router/route-destination-line'
import { RuleTokens } from '@/features/library/components/content-router/rule-tokens'
import type { RouteDestination } from '@/features/library/lib/content-router/route-list'
import type { SummaryToken } from '@/features/library/lib/content-router/rule-summary'
import { formatNumber } from '@/lib/format'

export interface RouteCardSummary {
  name: string
  tokens: SummaryToken[]
  destination: RouteDestination
  order: number | undefined
  enabled: boolean
  requiresApproval: boolean
}

interface RouteCardHeaderProps {
  route: RouteCardSummary
  open: boolean
  onToggleOpen: () => void
  onEnabledChange: (enabled: boolean) => void
  enabledDisabled: boolean
  enabledError: string | null
}

export function RouteCardHeader({
  route,
  open,
  onToggleOpen,
  onEnabledChange,
  enabledDisabled,
  enabledError,
}: RouteCardHeaderProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-3.5">
        <div
          className={cn(
            'flex w-14 shrink-0 flex-col items-center rounded-md border-2 border-border bg-inset pt-1 pb-1.5',
            !route.enabled && 'bg-card text-muted-foreground',
          )}
        >
          <span className="text-xs font-bold">Priority</span>
          <span className="text-xl leading-tight font-bold tabular-nums">
            {route.order === undefined ? '' : formatNumber(route.order)}
          </span>
        </div>
        <button
          type="button"
          className="flex min-w-0 flex-1 flex-col items-start gap-1.5 rounded-md text-left outline-foreground/50 focus-visible:outline-3 focus-visible:outline-offset-0"
          aria-expanded={open}
          onClick={onToggleOpen}
        >
          <span className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'font-heading text-base font-medium break-words',
                !route.enabled && 'text-muted-foreground',
              )}
            >
              {route.name}
            </span>
            {route.requiresApproval && (
              <Badge variant="secondary">Requires approval</Badge>
            )}
            {!route.enabled && <StatusPill tone="off" label="Off" />}
          </span>
          <RuleTokens tokens={route.tokens} />
          <RouteDestinationLine destination={route.destination} />
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <Switch
            checked={route.enabled}
            disabled={enabledDisabled}
            aria-label={`Enabled, ${route.name}`}
            onCheckedChange={onEnabledChange}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={open ? 'Collapse route' : 'Edit route'}
            aria-expanded={open}
            onClick={onToggleOpen}
          >
            {open ? <ChevronUp /> : <ChevronDown />}
          </Button>
        </div>
      </div>
      {enabledError && (
        <p role="alert" className="text-sm text-destructive-text">
          {enabledError}
        </p>
      )}
    </div>
  )
}
