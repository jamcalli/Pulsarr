import type {
  ContentItem,
  RoutingContext,
  TargetInstancesResult,
} from '@root/types/router.types.js'
import { getDefaultInstanceIds } from './default-routing.js'
import { enrichItemMetadata } from './enrichment.js'
import { evaluateRules } from './rule-resolver.js'
import type { ContentRouterDeps } from './types.js'

/** Dry run of the routing decision, with a skipReason when an empty list is deliberate. */
export async function getTargetInstances(
  item: ContentItem,
  context: RoutingContext,
  deps: Pick<
    ContentRouterDeps,
    | 'logger'
    | 'config'
    | 'db'
    | 'fastify'
    | 'rules'
    | 'radarrManager'
    | 'sonarrManager'
  >,
): Promise<TargetInstancesResult> {
  const { logger } = deps
  const contentType = context.contentType

  const allRouterRules = await deps.rules.get()
  const hasAnyRules = allRouterRules.some((rule) => rule.enabled)

  const itemForEvaluation = hasAnyRules
    ? await enrichItemMetadata(allRouterRules, item, context, deps)
    : item

  const resolution = evaluateRules(
    logger,
    allRouterRules,
    itemForEvaluation,
    context,
  )

  if (resolution.skipReason === 'excluded') {
    return { instanceIds: [], skipReason: 'excluded' }
  }

  // several rules may target the same instance
  if (resolution.decisions.length > 0) {
    return {
      instanceIds: [...new Set(resolution.decisions.map((d) => d.instanceId))],
    }
  }

  if (context.syncing && context.syncTargetInstanceId !== undefined) {
    return { instanceIds: [context.syncTargetInstanceId] }
  }

  return await getDefaultInstanceIds(contentType, deps)
}
