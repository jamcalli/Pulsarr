import type { ContentRouterRule } from '@schemas/content-router/content-router.schema.js'
import type { RouterRule } from '@root/types/router.types.js'

/**
 * Converts a router rule into a normalized API response object.
 *
 * Parses the `criteria` property to extract the `condition` field and returns a standardized object with normalized fields, applying defaults for missing or null values. Ensures consistent output even if `criteria` is invalid or unparsable.
 *
 * @param rule - The router rule to convert.
 * @returns The normalized router rule object for API responses.
 *
 * @remark If `criteria` is not valid JSON, the error is logged (if a logger is provided) and `condition` is set to `undefined` in the response.
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
      tags: Array.isArray(rule.tags) ? rule.tags : [],
      search_on_add:
        rule.search_on_add !== null && rule.search_on_add !== undefined
          ? Boolean(rule.search_on_add)
          : undefined,
      season_monitoring:
        rule.season_monitoring !== null ? rule.season_monitoring : undefined,
      series_type: rule.series_type !== null ? rule.series_type : undefined,
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
      tags: Array.isArray(rule.tags) ? rule.tags : [],
      search_on_add:
        rule.search_on_add !== null && rule.search_on_add !== undefined
          ? Boolean(rule.search_on_add)
          : undefined,
      season_monitoring:
        rule.season_monitoring !== null ? rule.season_monitoring : undefined,
      series_type: rule.series_type !== null ? rule.series_type : undefined,
      created_at: rule.created_at,
      updated_at: rule.updated_at,
    }
  }
}
