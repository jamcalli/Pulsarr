import type { ContentRouterRule } from '@schemas/content-router/content-router.schema.js'
import type { RouterRule } from '@root/types/router.types.js'

/**
 * Converts a router rule into a standardized API response object.
 *
 * Parses the `criteria` property of the input rule to extract the `condition` field, handling both stringified and object forms. If parsing fails, the `condition` is set to `undefined` to ensure a valid response structure. The returned object includes all relevant rule fields, including `tags`, defaulting to an empty array if not present.
 *
 * @param rule - The router rule to format for API output.
 * @returns The formatted router rule object for API responses.
 *
 * @remark If `criteria` is an invalid JSON string, the function logs the error (if a logger is provided) and sets `condition` to `undefined` in the result.
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
      tags: rule.tags || [],
      search_on_add:
        rule.search_on_add !== null ? Boolean(rule.search_on_add) : null,
      season_monitoring: rule.season_monitoring,
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
      tags: rule.tags || [],
      search_on_add:
        rule.search_on_add !== null ? Boolean(rule.search_on_add) : null,
      season_monitoring: rule.season_monitoring,
      created_at: rule.created_at,
      updated_at: rule.updated_at,
    }
  }
}
