import type {
  Condition,
  ConditionGroup,
  RouterRule,
} from '@root/types/router.types.js'
import {
  DEFAULT_ROUTE_PRIORITY,
  ROUTER_RULE_PRIORITY,
} from '@schemas/content-router/content-router.schema.js'
import type { DatabaseService } from '@services/database.service.js'
import { parseJsonOr } from '@utils/json.js'
import type { FastifyBaseLogger } from 'fastify'

function formatRouterRule(
  log: FastifyBaseLogger,
  rule: {
    id: number
    name: string
    type: string
    criteria: string | Record<string, unknown>
    target_type: 'sonarr' | 'radarr'
    target_instance_id: number | null
    root_folder?: string | null
    quality_profile?: number | null
    tags?: string | string[]
    order: number
    enabled: number | boolean
    metadata?: string | null
    search_on_add?: number | boolean | null
    season_monitoring?: string | null
    always_require_approval?: number | boolean
    bypass_user_quotas?: number | boolean
    approval_reason?: string | null
    exclude_from_routing?: number | boolean
    created_at: string
    updated_at: string
    [key: string]: unknown
  },
): RouterRule {
  return {
    ...rule,
    enabled: Boolean(rule.enabled),
    search_on_add:
      rule.search_on_add == null ? null : Boolean(rule.search_on_add),
    always_require_approval: Boolean(rule.always_require_approval ?? false),
    bypass_user_quotas: Boolean(rule.bypass_user_quotas ?? false),
    approval_reason: rule.approval_reason ?? null,
    exclude_from_routing: Boolean(rule.exclude_from_routing ?? false),
    criteria:
      typeof rule.criteria === 'string'
        ? parseJsonOr(
            rule.criteria,
            { condition: { operator: 'AND' as const, conditions: [] } },
            log,
            'router_rule.criteria',
          )
        : (rule.criteria as { condition: Condition | ConditionGroup }),
    tags:
      typeof rule.tags === 'string'
        ? parseJsonOr(rule.tags, [], log, 'router_rule.tags')
        : rule.tags || [],
    metadata: rule.metadata
      ? typeof rule.metadata === 'string'
        ? parseJsonOr(rule.metadata, null, log, 'router_rule.metadata')
        : rule.metadata
      : null,
  }
}

export async function getAllRouterRules(
  this: DatabaseService,
): Promise<RouterRule[]> {
  const rules = await this.knex('router_rules')
    .select('*')
    .orderBy('order', 'desc')
    .orderBy('id', 'asc')

  return rules.map((rule) => formatRouterRule(this.log, rule))
}

export async function getRouterRuleById(
  this: DatabaseService,
  id: number,
): Promise<RouterRule | null> {
  const rule = await this.knex('router_rules').where('id', id).first()

  if (!rule) return null

  return formatRouterRule(this.log, rule)
}

export async function getRouterRulesByType(
  this: DatabaseService,
  type: string,
  enabledOnly = true,
): Promise<RouterRule[]> {
  const query = this.knex('router_rules').select('*').where('type', type)

  if (enabledOnly) {
    query.where('enabled', true)
  }

  const rules = await query.orderBy('order', 'desc').orderBy('id', 'asc')

  return rules.map((rule) => formatRouterRule(this.log, rule))
}

export async function createRouterRule(
  this: DatabaseService,
  rule: Omit<RouterRule, 'id' | 'created_at' | 'updated_at'>,
): Promise<RouterRule> {
  const insertData = {
    ...rule,
    criteria: JSON.stringify(rule.criteria),
    tags: rule.tags ? JSON.stringify(rule.tags) : JSON.stringify([]),
    metadata: rule.metadata ? JSON.stringify(rule.metadata) : null,
    created_at: this.timestamp,
    updated_at: this.timestamp,
  }

  const [createdRule] = await this.knex('router_rules')
    .insert(insertData)
    .returning('*')

  if (!createdRule) throw new Error('Failed to create router rule')

  return formatRouterRule(this.log, createdRule)
}

/** Throws when the rule does not exist, and writes only whitelisted columns */
export async function updateRouterRule(
  this: DatabaseService,
  id: number,
  updates: Partial<Omit<RouterRule, 'id' | 'created_at' | 'updated_at'>>,
): Promise<RouterRule> {
  const updateData: Record<string, unknown> = {
    updated_at: this.timestamp,
  }

  // Explicitly whitelist allowed columns to prevent schema drift
  if (updates.name !== undefined) {
    updateData.name = updates.name
  }

  if (updates.type !== undefined) {
    updateData.type = updates.type
  }

  if (updates.criteria !== undefined) {
    updateData.criteria = JSON.stringify(updates.criteria)
  }

  if (updates.target_type !== undefined) {
    updateData.target_type = updates.target_type
  }

  if (updates.target_instance_id !== undefined) {
    updateData.target_instance_id = updates.target_instance_id
  }

  if (updates.root_folder !== undefined) {
    updateData.root_folder = updates.root_folder
  }

  if (updates.quality_profile !== undefined) {
    updateData.quality_profile = updates.quality_profile
  }

  if (updates.tags !== undefined) {
    updateData.tags = JSON.stringify(updates.tags || [])
  }

  if (updates.order !== undefined) {
    updateData.order = updates.order
  }

  if (updates.enabled !== undefined) {
    updateData.enabled = updates.enabled
  }

  if (updates.metadata !== undefined) {
    updateData.metadata = updates.metadata
      ? JSON.stringify(updates.metadata)
      : null
  }

  if (updates.search_on_add !== undefined) {
    updateData.search_on_add = updates.search_on_add
  }

  if (updates.season_monitoring !== undefined) {
    updateData.season_monitoring = updates.season_monitoring
  }

  if (updates.series_type !== undefined) {
    updateData.series_type = updates.series_type
  }

  if (updates.monitor !== undefined) {
    updateData.monitor = updates.monitor
  }

  if (updates.always_require_approval !== undefined) {
    updateData.always_require_approval = updates.always_require_approval
  }

  if (updates.bypass_user_quotas !== undefined) {
    updateData.bypass_user_quotas = updates.bypass_user_quotas
  }

  if (updates.approval_reason !== undefined) {
    updateData.approval_reason = updates.approval_reason
  }

  if (updates.exclude_from_routing !== undefined) {
    updateData.exclude_from_routing = updates.exclude_from_routing
  }

  const [updatedRule] = await this.knex('router_rules')
    .where('id', id)
    .update(updateData)
    .returning('*')

  if (!updatedRule) {
    throw new Error(
      `Router rule with ID ${id} not found or could not be updated`,
    )
  }

  return formatRouterRule(this.log, updatedRule)
}

export async function deleteRouterRule(
  this: DatabaseService,
  id: number,
): Promise<boolean> {
  const deleted = await this.knex('router_rules').where('id', id).delete()
  return deleted > 0
}

export async function getRouterRulesByTarget(
  this: DatabaseService,
  targetType: 'sonarr' | 'radarr',
  instanceId: number,
): Promise<RouterRule[]> {
  const rules = await this.knex('router_rules')
    .select('*')
    .where({
      target_type: targetType,
      target_instance_id: instanceId,
      enabled: true,
    })
    .orderBy('order', 'desc')
    .orderBy('id', 'asc')

  return rules.map((rule) => formatRouterRule(this.log, rule))
}

export async function getRouterRulesByTargetType(
  this: DatabaseService,
  targetType: 'sonarr' | 'radarr',
): Promise<RouterRule[]> {
  try {
    const rules = await this.knex('router_rules')
      .select('*')
      .where('target_type', targetType)
      .orderBy('order', 'desc')
      .orderBy('id', 'asc')

    this.log.debug(
      `Found ${rules.length} router rules for target type: ${targetType}`,
    )

    return rules.map((rule) => formatRouterRule(this.log, rule))
  } catch (error) {
    this.log.error(
      { error },
      `Error fetching router rules by target type ${targetType}`,
    )
    throw error
  }
}

/** Throws when the rule does not exist */
export async function toggleRouterRule(
  this: DatabaseService,
  id: number,
  enabled: boolean,
): Promise<RouterRule> {
  const [updatedRule] = await this.knex('router_rules')
    .where('id', id)
    .update({
      enabled,
      updated_at: this.timestamp,
    })
    .returning('*')

  if (!updatedRule) {
    throw new Error(
      `Router rule with ID ${id} not found or could not be updated`,
    )
  }

  return formatRouterRule(this.log, updatedRule)
}

/** Stores every priority in one transaction, so a failure leaves all rules unchanged. */
export async function setRouterRuleOrders(
  this: DatabaseService,
  orders: ReadonlyArray<{ id: number; order: number }>,
): Promise<void> {
  await this.knex.transaction(async (trx) => {
    for (const { id, order } of orders) {
      await trx('router_rules')
        .where('id', id)
        .update({ order, updated_at: this.timestamp })
    }
  })
}

/** The priority that puts a new rule after every rule of its type. */
export async function nextRouterRuleOrder(
  this: DatabaseService,
  targetType: 'radarr' | 'sonarr',
): Promise<number> {
  const row = await this.knex('router_rules')
    .where('target_type', targetType)
    .select(
      this.knex.raw('MIN(COALESCE(??, ?)) AS ??', [
        'order',
        DEFAULT_ROUTE_PRIORITY,
        'lowest',
      ]),
    )
    .first<{ lowest: number | string | null } | undefined>()

  if (row?.lowest == null) return DEFAULT_ROUTE_PRIORITY
  return Math.max(ROUTER_RULE_PRIORITY.min, Number(row.lowest) - 1)
}
