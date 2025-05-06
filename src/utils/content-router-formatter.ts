import type { ContentRouterRule } from '@schemas/content-router/content-router.schema.js'
import type { RouterRule } from '@root/types/router.types.js'

/**
 * Formats a router rule object into a standardized API response.
 *
 * Attempts to parse the {@link rule.criteria} property as JSON if it is a string, extracting the `condition` field for the response. If parsing fails, the `condition` field is set to `undefined` to ensure a valid response object.
 *
 * @param rule - The router rule to convert.
 * @returns A formatted router rule suitable for API responses.
 *
 * @remark If {@link rule.criteria} is an invalid JSON string, the function logs the error (if a logger is provided) and sets `condition` to `undefined` in the result.
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
      created_at: rule.created_at,
      updated_at: rule.updated_at,
    }
  }
}
