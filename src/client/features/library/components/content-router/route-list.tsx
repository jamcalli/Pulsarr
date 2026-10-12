import { CornerDownRight, Route } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/empty-state'
import { Accordion } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import {
  RouteCardItem,
  type RouteSwitch,
} from '@/features/library/components/content-router/route-card-item'
import { RouteFallbackFrame } from '@/features/library/components/content-router/route-fallback-frame'
import type { ConditionCatalog } from '@/features/library/hooks/content-router/useConditionCatalog'
import type { OpenKey } from '@/features/library/hooks/content-router/useContentRouterPage'
import type { RouteTargets } from '@/features/library/hooks/content-router/useRouteTargets'
import type { RouteType } from '@/features/library/lib/content-router/condition-fields'
import {
  emptyCopy,
  fallbackLine,
  noInstanceCopy,
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
  const card = (rule: RouterRule | null) => {
    const key = rule?.id ?? 'new'
    const open = openKey === key
    return (
      <RouteCardItem
        key={key}
        type={type}
        rule={rule}
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
        <Button
          variant="link"
          size="sm"
          nativeButton={false}
          render={<Link to={pageHref(NAV_PAGES[type])} />}
        >
          {empty.action}
        </Button>
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
      <Accordion value={openKey === null ? [] : [openKey]} className="gap-4">
        {openKey === 'new' && card(null)}
        {routes.map(card)}
      </Accordion>
      <RouteFallbackFrame
        media={<CornerDownRight aria-hidden className="size-5 text-primary" />}
      >
        <p className="text-pretty text-muted-foreground">
          {fallbackLine(type, targets.fallback)}
        </p>
      </RouteFallbackFrame>
    </div>
  )
}
