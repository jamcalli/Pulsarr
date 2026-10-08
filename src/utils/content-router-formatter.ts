import type { RouterRule } from '@root/types/router.types.js'
import type { ContentRouterRule } from '@schemas/content-router/content-router.schema.js'

/** Null on a routing field means the rule inherits the instance's value. */
export function formatRule(rule: RouterRule): ContentRouterRule {
  return {
    id: rule.id,
    name: rule.name,
    target_type: rule.target_type,
    target_instance_id: rule.target_instance_id,
    root_folder: rule.root_folder || null,
    quality_profile: rule.quality_profile ?? null,
    order: rule.order,
    enabled: Boolean(rule.enabled),
    condition: rule.criteria?.condition as ContentRouterRule['condition'],
    tags: Array.isArray(rule.tags) ? rule.tags : [],
    search_on_add: rule.search_on_add ?? null,
    season_monitoring: rule.season_monitoring ?? null,
    series_type: rule.series_type ?? null,
    monitor: rule.monitor ?? null,
    always_require_approval: rule.always_require_approval ?? false,
    bypass_user_quotas: rule.bypass_user_quotas ?? false,
    approval_reason: rule.approval_reason || undefined,
    exclude_from_routing: rule.exclude_from_routing ?? false,
    created_at: rule.created_at,
    updated_at: rule.updated_at,
  }
}
