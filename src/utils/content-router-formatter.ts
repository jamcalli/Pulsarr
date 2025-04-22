import type { ContentRouterRule } from '@schemas/content-router/content-router.schema.js'
import type { RouterRule } from '@root/types/router.types.js'

/**
 * Formats a database router rule into the API response format
 * @param rule The database router rule to format
 * @param logger Optional logger for error reporting
 * @returns A formatted ContentRouterRule for API response
 */
export function formatRule(
  rule: RouterRule,
  logger?: { error: (message: string, error?: unknown) => void },
): ContentRouterRule {
  try {
    // Extract condition from criteria
    const criteria =
      typeof rule.criteria === 'string'
        ? JSON.parse(rule.criteria)
        : rule.criteria || {}

    // Format and return the rule
    return {
      id: rule.id,
      name: rule.name,
      target_type: rule.target_type,
      target_instance_id: rule.target_instance_id,
      root_folder: rule.root_folder || undefined,
      quality_profile:
        rule.quality_profile !== null ? rule.quality_profile : undefined,
      order: rule.order,
      enabled: Boolean(rule.enabled),
      condition: criteria.condition,
      created_at: rule.created_at,
      updated_at: rule.updated_at,
    }
  } catch (parseError) {
    // Log the error if a logger is provided
    if (logger) {
      logger.error(`Error parsing criteria for rule ID ${rule.id}:`, parseError)
    }

    // Return the rule with an empty condition to avoid breaking the entire response
    return {
      id: rule.id,
      name: rule.name,
      target_type: rule.target_type,
      target_instance_id: rule.target_instance_id,
      root_folder: rule.root_folder || undefined,
      quality_profile:
        rule.quality_profile !== null ? rule.quality_profile : undefined,
      order: rule.order,
      enabled: Boolean(rule.enabled),
      condition: undefined,
      created_at: rule.created_at,
      updated_at: rule.updated_at,
    }
  }
}
