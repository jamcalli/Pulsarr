import type { RouterRule } from '@root/types/router.types.js'
import {
  type ContentRouterRuleOrder,
  type ContentRouterRuleUpdate,
  DEFAULT_ROUTE_PRIORITY,
} from '@schemas/content-router/content-router.schema.js'
import type { DatabaseService } from '@services/database.service.js'
import { rejectedRouterRulePriority } from '@utils/router-rule-priority.js'
import {
  invalidSeasonMonitoringMessage,
  rejectedSeasonMonitoring,
} from '@utils/season-monitoring.js'
import type { FastifyInstance } from 'fastify'

export interface RuleWriteDeps {
  db: DatabaseService
  httpErrors: FastifyInstance['httpErrors']
  clearRules(): void
}

type StoredRulePayload = Omit<
  RouterRule,
  'id' | 'created_at' | 'updated_at' | 'metadata'
>

/** PUT is a full replace, so every clearable column gets an explicit value because updateRouterRule skips undefined fields. */
function normalizeRulePayload(
  ruleData: ContentRouterRuleUpdate,
): StoredRulePayload {
  const excludeFromRouting = ruleData.exclude_from_routing ?? false

  return {
    name: ruleData.name,
    type: 'conditional',
    criteria: {
      condition: ruleData.condition || {
        operator: 'AND',
        conditions: [],
        negate: false,
      },
    },
    target_type: ruleData.target_type,
    // Exclude rules never route, so instance-scoped fields are cleared
    target_instance_id: excludeFromRouting ? null : ruleData.target_instance_id,
    root_folder: excludeFromRouting ? null : (ruleData.root_folder ?? null),
    quality_profile: excludeFromRouting
      ? null
      : (ruleData.quality_profile ?? null),
    tags: excludeFromRouting ? [] : ruleData.tags || [],
    order: ruleData.order ?? DEFAULT_ROUTE_PRIORITY,
    enabled: ruleData.enabled ?? true,
    search_on_add: ruleData.search_on_add ?? null,
    season_monitoring: ruleData.season_monitoring ?? null,
    series_type: ruleData.series_type ?? null,
    monitor: ruleData.monitor ?? null,
    always_require_approval: ruleData.always_require_approval ?? false,
    bypass_user_quotas: ruleData.bypass_user_quotas ?? false,
    approval_reason: ruleData.approval_reason ?? null,
    exclude_from_routing: excludeFromRouting,
  }
}

async function assertTargetInstanceExists(
  ruleData: ContentRouterRuleUpdate,
  { db, httpErrors }: RuleWriteDeps,
): Promise<void> {
  const id = ruleData.target_instance_id
  if (id == null) return
  const instance =
    ruleData.target_type === 'radarr'
      ? await db.getRadarrInstance(id)
      : await db.getSonarrInstance(id)
  if (instance === null) {
    throw httpErrors.badRequest('Target instance does not exist')
  }
}

async function existingRule(
  id: number,
  { db, httpErrors }: RuleWriteDeps,
): Promise<RouterRule> {
  const rule = await db.getRouterRuleById(id)
  if (!rule) throw httpErrors.notFound(`Router rule with ID ${id} not found`)
  return rule
}

export async function createRule(
  ruleData: ContentRouterRuleUpdate,
  deps: RuleWriteDeps,
): Promise<RouterRule> {
  const rejected = rejectedSeasonMonitoring(ruleData.season_monitoring, [])
  if (rejected !== undefined) {
    throw deps.httpErrors.badRequest(invalidSeasonMonitoringMessage(rejected))
  }
  await assertTargetInstanceExists(ruleData, deps)

  const order =
    ruleData.order ?? (await deps.db.nextRouterRuleOrder(ruleData.target_type))
  const created = await deps.db.createRouterRule({
    ...normalizeRulePayload(ruleData),
    order,
    metadata: null,
  })
  deps.clearRules()
  return created
}

export async function updateRule(
  id: number,
  ruleData: ContentRouterRuleUpdate,
  deps: RuleWriteDeps,
): Promise<RouterRule> {
  const stored = await existingRule(id, deps)

  const rejected = rejectedSeasonMonitoring(ruleData.season_monitoring, [
    stored.season_monitoring,
  ])
  if (rejected !== undefined) {
    throw deps.httpErrors.badRequest(invalidSeasonMonitoringMessage(rejected))
  }
  const rejectedPriority = rejectedRouterRulePriority(
    ruleData.order,
    stored.order,
  )
  if (rejectedPriority !== undefined) {
    throw deps.httpErrors.badRequest(rejectedPriority)
  }
  await assertTargetInstanceExists(ruleData, deps)

  const updated = await deps.db.updateRouterRule(
    id,
    normalizeRulePayload(ruleData),
  )
  deps.clearRules()
  return updated
}

export async function deleteRule(
  id: number,
  deps: RuleWriteDeps,
): Promise<void> {
  if (!(await deps.db.deleteRouterRule(id))) {
    throw deps.httpErrors.notFound(`Router rule with ID ${id} not found`)
  }
  deps.clearRules()
}

export async function toggleRule(
  id: number,
  enabled: boolean,
  deps: RuleWriteDeps,
): Promise<void> {
  await existingRule(id, deps)
  await deps.db.toggleRouterRule(id, enabled)
  deps.clearRules()
}

/** Resolves to every rule after the reorder. */
export async function reorderRules(
  orders: ContentRouterRuleOrder['orders'],
  deps: RuleWriteDeps,
): Promise<RouterRule[]> {
  const existingIds = new Set(
    (await deps.db.getAllRouterRules()).map((rule) => rule.id),
  )
  const missing = orders.find(({ id }) => !existingIds.has(id))
  if (missing) {
    throw deps.httpErrors.notFound(
      `Router rule with ID ${missing.id} not found`,
    )
  }

  await deps.db.setRouterRuleOrders(orders)
  deps.clearRules()
  return deps.db.getAllRouterRules()
}
