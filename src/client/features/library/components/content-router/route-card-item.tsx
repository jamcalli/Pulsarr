import { cn } from 'cn'
import { Ban } from 'lucide-react'
import { useState } from 'react'
import { StatusPill } from '@/components/status-pill'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { AccordionCard } from '@/features/library/components/accordion-card'
import { RouteDestinationLine } from '@/features/library/components/content-router/route-destination-line'
import { RouteEditorPanel } from '@/features/library/components/content-router/route-editor-panel'
import { RuleTokens } from '@/features/library/components/content-router/rule-tokens'
import type { ConditionCatalog } from '@/features/library/hooks/content-router/useConditionCatalog'
import type { RouteTargets } from '@/features/library/hooks/content-router/useRouteTargets'
import type { RouteType } from '@/features/library/lib/content-router/condition-fields'
import {
  conditionNodes,
  type RouteFormValues,
} from '@/features/library/lib/content-router/route-form'
import type { RouteDestination } from '@/features/library/lib/content-router/route-list'
import {
  ruleTokens,
  type SummaryToken,
} from '@/features/library/lib/content-router/rule-summary'
import { formatNumber } from '@/lib/format'
import type { components } from '@/types/api.js'

type RouterRule = components['schemas']['RouterRule']

export interface RouteSwitch {
  onChange: (id: number, enabled: boolean) => void
  error: (id: number) => string | null
  pending: (id: number) => boolean
}

interface RouteCardSummary {
  name: string
  tokens: SummaryToken[]
  exclude: boolean
  destination: RouteDestination
  requiresApproval: boolean
}

function storedSummary(
  rule: RouterRule,
  catalog: ConditionCatalog,
  targets: RouteTargets,
): RouteCardSummary {
  const exclude = rule.exclude_from_routing ?? false
  return {
    name: rule.name.trim() || 'Untitled route',
    tokens: ruleTokens(
      conditionNodes(rule.condition, catalog.controlFor, catalog.blank),
      catalog.valueLabel,
    ),
    exclude,
    destination: targets.ruleDestination(rule),
    requiresApproval: !exclude && (rule.always_require_approval ?? false),
  }
}

function draftSummary(
  values: RouteFormValues,
  isNew: boolean,
  catalog: ConditionCatalog,
  targets: RouteTargets,
): RouteCardSummary {
  const exclude = values.action === 'exclude'
  return {
    name: values.name.trim() || (isNew ? 'New route' : 'Untitled route'),
    tokens: ruleTokens(values.conditions, catalog.valueLabel),
    exclude,
    destination: targets.destination({
      exclude,
      instanceId: Number(values.routing.instanceId) || null,
      qualityProfile: values.routing.qualityProfile,
      rootFolder: values.routing.rootFolder,
    }),
    requiresApproval: !exclude && values.always_require_approval,
  }
}

function blankSummary(targets: RouteTargets): RouteCardSummary {
  return {
    name: 'New route',
    tokens: [],
    exclude: false,
    destination: targets.destination({
      exclude: false,
      instanceId: null,
      qualityProfile: null,
      rootFolder: null,
    }),
    requiresApproval: false,
  }
}

interface RouteCardItemProps {
  type: RouteType
  /** Null while creating a route. */
  rule: RouterRule | null
  /** Rank among route rules, null for exclude rules and the unsaved new route. */
  rank: number | null
  hint: string | null
  open: boolean
  catalog: ConditionCatalog
  targets: RouteTargets
  routeSwitch: RouteSwitch
  /** Collapsing asks first while there are unsaved changes, Cancel discards them. */
  onToggle: () => void
  onClose: () => void
  onDelete: (rule: RouterRule) => void
  reportDirty: (dirty: boolean) => void
}

const ignoreDirty = () => {}

export function RouteCardItem({
  type,
  rule,
  rank,
  hint,
  open,
  catalog,
  targets,
  routeSwitch,
  onToggle,
  onClose,
  onDelete,
  reportDirty,
}: RouteCardItemProps) {
  const [draft, setDraft] = useState<RouteFormValues | null>(null)
  const [newEnabled, setNewEnabled] = useState(true)
  const enabled = rule === null ? newEnabled : (rule.enabled ?? true)
  const route =
    open && draft
      ? draftSummary(draft, rule === null, catalog, targets)
      : rule
        ? storedSummary(rule, catalog, targets)
        : blankSummary(targets)
  const enabledError = rule === null ? null : routeSwitch.error(rule.id)
  // A closing card keeps its editor through the exit animation, so only the open one may report.
  const panelReportDirty = open ? reportDirty : ignoreDirty

  return (
    <AccordionCard
      value={rule?.id ?? 'new'}
      title={route.name}
      muted={!enabled}
      leading={
        <div
          className={cn(
            'flex w-14 shrink-0 flex-col items-center rounded-md border-2 border-border bg-inset pt-1 pb-1.5',
            !enabled && 'bg-card text-muted-foreground',
          )}
        >
          {route.exclude ? (
            <>
              <span className="text-xs font-bold">Skip</span>
              <span className="flex h-7 items-center">
                <Ban aria-hidden className="size-5" />
              </span>
            </>
          ) : (
            <>
              <span className="text-xs font-bold">Rank</span>
              <span className="text-xl leading-tight font-bold tabular-nums">
                {rank === null ? '' : formatNumber(rank)}
              </span>
            </>
          )}
        </div>
      }
      badges={
        <>
          {route.requiresApproval && (
            <Badge variant="secondary">Requires approval</Badge>
          )}
          {!enabled && <StatusPill tone="off" label="Off" />}
        </>
      }
      trailing={
        <Switch
          checked={enabled}
          disabled={rule !== null && routeSwitch.pending(rule.id)}
          aria-label={`Enabled, ${route.name}`}
          onCheckedChange={(next) =>
            rule === null
              ? setNewEnabled(next)
              : routeSwitch.onChange(rule.id, next)
          }
        />
      }
      summary={
        <>
          <RuleTokens tokens={route.tokens} />
          <RouteDestinationLine destination={route.destination} />
          {hint && (
            <p className="pl-6 text-sm text-pretty text-muted-foreground">
              {hint}
            </p>
          )}
        </>
      }
      footer={
        enabledError && (
          <p role="alert" className="text-sm text-destructive-text">
            {enabledError}
          </p>
        )
      }
      open={open}
      onToggle={onToggle}
    >
      <RouteEditorPanel
        type={type}
        rule={rule}
        catalog={catalog}
        targets={targets}
        newEnabled={newEnabled}
        onValues={setDraft}
        onClose={onClose}
        onDelete={onDelete}
        reportDirty={panelReportDirty}
      />
    </AccordionCard>
  )
}
