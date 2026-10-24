import { CornerDownRight, ListOrdered, Route } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { InlineLink } from '@/components/inline-link'
import { Accordion } from '@/components/ui/accordion'
import {
  RouteCardItem,
  type RouteSwitch,
} from '@/features/library/components/content-router/route-card-item'
import { RouteNoteFrame } from '@/features/library/components/content-router/route-note-frame'
import type { ConditionCatalog } from '@/features/library/hooks/content-router/useConditionCatalog'
import type { OpenKey } from '@/features/library/hooks/content-router/useContentRouterPage'
import type { RouteTargets } from '@/features/library/hooks/content-router/useRouteTargets'
import type { RouteType } from '@/features/library/lib/content-router/condition-fields'
import {
  emptyCopy,
  fallbackLine,
  noInstanceCopy,
  orderNote,
  siblingHint,
  yieldsTo,
} from '@/features/library/lib/content-router/route-list'
import { NAV_PAGES, pageHref } from '@/lib/navigation'
import type { components } from '@/types/api.js'

type RouterRule = components['schemas']['RouterRule']

interface RouteListProps {
  type: RouteType
  routes: RouterRule[]
  openKey: OpenKey
  catalog: ConditionCatalog
  targets: RouteTargets
  routeSwitch: RouteSwitch
  onOpen: (id: number) => void
  onCollapse: () => void
  onClose: () => void
  onDelete: (rule: RouterRule) => void
  reportDirty: (dirty: boolean) => void
}

export function RouteList({
  type,
  routes,
  openKey,
  catalog,
  targets,
  routeSwitch,
  onOpen,
  onCollapse,
  onClose,
  onDelete,
  reportDirty,
}: RouteListProps) {
  const ranks = new Map(
    routes
      .filter((rule) => !rule.exclude_from_routing)
      .map((rule, index) => [rule.id, index + 1]),
  )
  const yields = yieldsTo(routes)
  const hintFor = (rule: RouterRule) => {
    const winnerRanks = (yields.get(rule.id) ?? []).flatMap(
      (id) => ranks.get(id) ?? [],
    )
    const destination = targets.ruleDestination(rule)
    return winnerRanks.length > 0 && destination.kind === 'instance'
      ? siblingHint(winnerRanks, destination.name)
      : null
  }
  const hasSkip = routes.some((rule) => rule.exclude_from_routing)
  const note = orderNote(type, hasSkip)

  const card = (rule: RouterRule | null) => {
    const key = rule?.id ?? 'new'
    const open = openKey === key
    return (
      <RouteCardItem
        key={key}
        type={type}
        rule={rule}
        rank={rule === null ? null : (ranks.get(rule.id) ?? null)}
        hint={rule === null ? null : hintFor(rule)}
        open={open}
        catalog={catalog}
        targets={targets}
        routeSwitch={routeSwitch}
        onToggle={() =>
          rule === null || open ? onCollapse() : onOpen(rule.id)
        }
        onClose={onClose}
        onDelete={onDelete}
        reportDirty={reportDirty}
      />
    )
  }

  if (routes.length === 0 && !targets.hasInstance) {
    const empty = noInstanceCopy(type)
    return (
      <EmptyState
        icon={<Route />}
        title={empty.title}
        description={empty.description}
      >
        <InlineLink to={pageHref(NAV_PAGES[type])}>{empty.action}</InlineLink>
      </EmptyState>
    )
  }

  if (routes.length === 0 && openKey !== 'new') {
    const empty = emptyCopy(type, targets.fallback)
    return (
      <EmptyState
        icon={<Route />}
        title={empty.title}
        description={empty.description}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <RouteNoteFrame
        media={<ListOrdered aria-hidden className="size-5 text-primary" />}
      >
        <p className="text-pretty text-muted-foreground">
          <span className="font-bold text-foreground">{note.lead}</span>{' '}
          {note.body}
        </p>
      </RouteNoteFrame>
      <Accordion value={openKey === null ? [] : [openKey]} className="gap-4">
        {openKey === 'new' && card(null)}
        {routes.map((rule) => card(rule))}
      </Accordion>
      <RouteNoteFrame
        media={<CornerDownRight aria-hidden className="size-5 text-primary" />}
      >
        <p className="text-pretty text-muted-foreground">
          {fallbackLine(type, targets.fallback)}
        </p>
      </RouteNoteFrame>
    </div>
  )
}
