import {
  DEFAULT_ROUTE_PRIORITY,
  ROUTER_RULE_PRIORITY,
} from '@root/schemas/content-router/content-router.schema'
import type { RouteType } from '@/features/library/lib/content-router/condition-fields'
import { ARR_TYPE_LABELS } from '@/lib/arr-labels'
import { formatList, formatNumber } from '@/lib/format'
import type { components } from '@/types/api.js'

type RouterRule = components['schemas']['RouterRule']

export const ROUTE_TABS: ReadonlyArray<{ value: RouteType; label: string }> = [
  { value: 'radarr', label: 'Movies' },
  { value: 'sonarr', label: 'TV shows' },
]

const NOUNS: Record<RouteType, { one: string; many: string; kind: string }> = {
  radarr: { one: 'movie', many: 'Movies', kind: 'movie' },
  sonarr: { one: 'show', many: 'Shows', kind: 'TV show' },
}

const isExclude = (rule: RouterRule) => rule.exclude_from_routing ?? false

/** The routes of one type in the order the router evaluates them, where exclude rules run before every route. */
export function routesFor(
  rules: readonly RouterRule[],
  type: RouteType,
): RouterRule[] {
  const sorted = rules
    .filter((rule) => rule.target_type === type)
    .sort(
      (a, b) =>
        (b.order ?? DEFAULT_ROUTE_PRIORITY) -
          (a.order ?? DEFAULT_ROUTE_PRIORITY) || a.id - b.id,
    )
  return [
    ...sorted.filter(isExclude),
    ...sorted.filter((rule) => !isExclude(rule)),
  ]
}

export function orderNote(
  type: RouteType,
  hasSkip: boolean,
): { lead: string; body: string } {
  return {
    lead: 'Routes run top to bottom.',
    body: `${hasSkip ? `Skip routes run first, and a match keeps the ${NOUNS[type].one} out. ` : ''}Every matching route sends the ${NOUNS[type].one}. When two share an instance, the one nearer the top wins. The top match decides approval and quotas.`,
  }
}

/** Maps each route to the enabled earlier routes that win its instance when they also match. */
export function yieldsTo(
  routes: readonly RouterRule[],
): ReadonlyMap<number, readonly number[]> {
  const earlier = new Map<number, number[]>()
  const yields = new Map<number, readonly number[]>()
  for (const rule of routes) {
    if (isExclude(rule) || rule.target_instance_id === null) continue
    const ids = earlier.get(rule.target_instance_id) ?? []
    if (ids.length > 0) yields.set(rule.id, ids)
    if (rule.enabled === false) continue
    earlier.set(rule.target_instance_id, [...ids, rule.id])
  }
  return yields
}

export function siblingHint(
  winnerRanks: readonly number[],
  instanceName: string,
): string {
  if (winnerRanks.length === 1) {
    return `Rank ${formatNumber(winnerRanks[0])} wins on ${instanceName} when both match.`
  }
  if (winnerRanks.length > 3) {
    return `A higher rank on ${instanceName} wins when it also matches.`
  }
  const ranks = winnerRanks.map((rank) => formatNumber(rank))
  const last = ranks.pop()
  return `Rank ${ranks.join(', ')} or ${last} wins on ${instanceName} when it also matches.`
}

/** `orderedIds` must be at most `ROUTER_RULE_PRIORITY.max` long. */
export function orderAssignments(
  orderedIds: readonly number[],
  routes: readonly RouterRule[],
): Array<{ id: number; order: number }> {
  const stored = new Map(
    routes.map((rule) => [rule.id, rule.order ?? DEFAULT_ROUTE_PRIORITY]),
  )
  return orderedIds
    .map((id, index) => ({ id, order: ROUTER_RULE_PRIORITY.max - index }))
    .filter(({ id, order }) => stored.get(id) !== order)
}

export function canReorder(routes: readonly RouterRule[]): boolean {
  const count = routes.filter((rule) => !isExclude(rule)).length
  return count >= 2 && count <= ROUTER_RULE_PRIORITY.max
}

export type RouteDestination =
  | { kind: 'skipped'; head: string; detail: string }
  | { kind: 'instance'; name: string; detail: string | null }

export function routeDestination(
  type: RouteType,
  {
    exclude,
    instanceName,
    qualityProfile,
    rootFolder,
  }: {
    exclude: boolean
    instanceName: string | null
    qualityProfile: string | null
    rootFolder: string | null
  },
): RouteDestination {
  if (exclude) {
    return { kind: 'skipped', head: 'Skipped.', detail: skipDetail(type) }
  }
  if (instanceName === null) {
    return {
      kind: 'skipped',
      head: 'Not routed.',
      detail: 'This route has no instance',
    }
  }
  const rest = [qualityProfile, rootFolder].filter((part): part is string =>
    Boolean(part),
  )
  return {
    kind: 'instance',
    name: instanceName,
    detail: rest.length ? formatList(rest) : null,
  }
}

export interface FallbackTarget {
  name: string
  skipsUnmatched: boolean
}

export function fallbackLine(
  type: RouteType,
  target: FallbackTarget | null,
): string {
  const arr = ARR_TYPE_LABELS[type]
  const { many } = NOUNS[type]
  if (target === null) return 'No instance is set up yet.'
  if (target.skipsUnmatched) {
    return `${many} that no route matches are not sent to ${arr}, because ${target.name} is set to skip them.`
  }
  return `${many} that no route matches go to ${target.name}, your default ${arr} instance.`
}

export function routesLabel(type: RouteType): string {
  return `${NOUNS[type].kind} routes`
}

export function emptyCopy(
  type: RouteType,
  target: FallbackTarget | null,
): { title: string; description: string } {
  const arr = ARR_TYPE_LABELS[type]
  const { one } = NOUNS[type]
  const title = `No ${routesLabel(type)}`
  if (target === null || target.skipsUnmatched) {
    return {
      title,
      description: `Until you add one, no ${one} is sent to ${arr}.`,
    }
  }
  return {
    title,
    description: `Until you add one, every ${one} goes to ${target.name}, your default ${arr} instance.`,
  }
}

export function noInstanceCopy(type: RouteType): {
  title: string
  description: string
  action: string
} {
  const arr = ARR_TYPE_LABELS[type]
  return {
    title: `No ${arr} instance`,
    description: `Routes send ${NOUNS[type].many.toLowerCase()} to a ${arr} instance, so set one up before adding routes.`,
    action: `Set up ${arr}`,
  }
}

function skipDetail(type: RouteType): string {
  return `Matching ${NOUNS[type].one}s are not sent to ${ARR_TYPE_LABELS[type]}`
}

export function excludeDescription(type: RouteType): string {
  return `${skipDetail(type)}.`
}
