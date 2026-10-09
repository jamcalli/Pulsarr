import {
  type RoutingFailureInput,
  routingFailureKey,
} from '@root/types/routing-failure.types.js'
import type { ContentRoutingDeps } from '../types.js'
import type { RouteContentResult } from './content-router.js'

export type RoutingFailureKeys = ReadonlySet<string>

export interface FailureTarget {
  userId: number
  key: string
  title: string
  contentType: 'show' | 'movie'
  /** Items known to have failures, so a clean result for any other item skips the write. */
  routingFailureKeys?: RoutingFailureKeys
}

const ARR_LABEL = { show: 'Sonarr', movie: 'Radarr' } as const
const ID_LABEL = { show: 'TVDB', movie: 'TMDB' } as const

export function missingIdFailure(
  contentType: 'show' | 'movie',
): RoutingFailureInput {
  return {
    category: 'missing_ids',
    message: `No ${ID_LABEL[contentType]} ID, so ${ARR_LABEL[contentType]} cannot add it`,
  }
}

/** Deliberate skips (rules, exclusions, already present) are not failures and clear any earlier one. */
export function failuresFromResult(
  result: RouteContentResult,
  contentType: 'show' | 'movie',
): RoutingFailureInput[] {
  switch (result.skippedReason) {
    case 'no-valid-id':
      return [missingIdFailure(contentType)]
    case 'no-target':
      return [
        {
          category: 'no_route',
          message: `No router rule matched and no usable default ${ARR_LABEL[contentType]} instance is set up`,
        },
      ]
    case 'no-instances-available':
      return [
        {
          category: 'instance_unavailable',
          message: `A target ${ARR_LABEL[contentType]} instance could not be checked for this item`,
        },
      ]
    default:
      return result.failures ?? []
  }
}

/** Never throws, because bookkeeping must not change whether routing succeeds. */
export async function persistRoutingFailures(
  target: FailureTarget,
  failures: RoutingFailureInput[],
  deps: Pick<ContentRoutingDeps, 'db' | 'logger'>,
): Promise<void> {
  if (failures.length === 0) {
    await clearRoutingFailures(target, deps)
    return
  }

  try {
    await deps.db.setRoutingFailures(target.userId, target.key, failures)
  } catch (error) {
    deps.logger.warn(
      { error, userId: target.userId, title: target.title },
      'Failed to record routing failure state',
    )
  }
}

/** Clears an item skipped on purpose; with routingFailureKeys, only an item listed there is written. */
export async function clearRoutingFailures(
  target: Pick<FailureTarget, 'userId' | 'key' | 'routingFailureKeys'>,
  deps: Pick<ContentRoutingDeps, 'db' | 'logger'>,
): Promise<void> {
  if (
    target.routingFailureKeys &&
    !target.routingFailureKeys.has(routingFailureKey(target.userId, target.key))
  ) {
    return
  }
  try {
    await deps.db.clearRoutingFailures(target.userId, target.key)
  } catch (error) {
    deps.logger.warn(
      { error, userId: target.userId, key: target.key },
      'Failed to clear routing failure state',
    )
  }
}

/** Records the outcome of one routing attempt, including a thrown error, which is rethrown. */
export async function trackRouting(
  target: FailureTarget,
  route: () => Promise<RouteContentResult>,
  deps: Pick<ContentRoutingDeps, 'db' | 'logger'>,
): Promise<RouteContentResult> {
  let result: RouteContentResult
  try {
    result = await route()
  } catch (error) {
    await persistRoutingFailures(
      target,
      [
        {
          category: 'routing_error',
          message: error instanceof Error ? error.message : String(error),
        },
      ],
      deps,
    )
    throw error
  }

  await persistRoutingFailures(
    target,
    failuresFromResult(result, target.contentType),
    deps,
  )
  return result
}
