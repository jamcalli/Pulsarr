import type { RouteType } from '@/features/library/lib/content-router/condition-fields'
import { DEFAULT_ROUTE_PRIORITY } from '@/lib/approval'
import { ARR_TYPE_LABELS } from '@/lib/arr-labels'
import { formatList } from '@/lib/format'
import type { components } from '@/types/api.js'

type RouterRule = components['schemas']['RouterRule']

export const ROUTE_TABS: ReadonlyArray<{ value: RouteType; label: string }> = [
  { value: 'radarr', label: 'Movies' },
  { value: 'sonarr', label: 'TV shows' },
]

const NOUNS: Record<RouteType, { one: string; many: string }> = {
  radarr: { one: 'movie', many: 'Movies' },
  sonarr: { one: 'show', many: 'Shows' },
}

/** The routes of one type, highest priority first and oldest first on a tie, the order the router evaluates them. */
export function routesFor(
  rules: readonly RouterRule[],
  type: RouteType,
): RouterRule[] {
  return rules
    .filter((rule) => rule.target_type === type)
    .sort(
      (a, b) =>
        (b.order ?? DEFAULT_ROUTE_PRIORITY) -
          (a.order ?? DEFAULT_ROUTE_PRIORITY) || a.id - b.id,
    )
}

export type RouteDestination =
  | { kind: 'skipped'; detail: string }
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
    return {
      kind: 'skipped',
      detail: `Matching ${NOUNS[type].one}s are skipped`,
    }
  }
  if (instanceName === null) {
    return { kind: 'skipped', detail: 'This route has no instance' }
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

export function emptyCopy(
  type: RouteType,
  target: FallbackTarget | null,
): { title: string; description: string } {
  const arr = ARR_TYPE_LABELS[type]
  const { one } = NOUNS[type]
  const title = type === 'radarr' ? 'No movie routes' : 'No TV show routes'
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

export function excludeDescription(type: RouteType): string {
  return `Matching ${NOUNS[type].one}s are not sent to ${ARR_TYPE_LABELS[type]}.`
}
