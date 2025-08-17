import { z } from 'zod'
import { SERIES_TYPES } from './constants.js'

// Re-export SERIES_TYPES for use by other modules
export { SERIES_TYPES }

// Helper function to check if a value is considered "non-empty" for validation
function isNonEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.length > 0
  return true
}

// Valid season monitoring options (hoisted to avoid per-call allocation)
const VALID_SEASON_MONITORING = new Set([
  'unknown',
  'all',
  'future',
  'missing',
  'existing',
  'firstseason',
  'lastseason',
  'latestseason',
  'pilot',
  'pilotrolling',
  'firstseasonrolling',
  'recent',
  'monitorspecials',
  'unmonitorspecials',
  'none',
  'skip',
])

// Base schemas for conditions
export const ComparisonOperatorSchema = z.enum([
  'equals',
  'notEquals',
  'contains',
  'notContains',
  'in',
  'notIn',
  'greaterThan',
  'lessThan',
  'between',
  'regex',
])

// Define the criteria schemas first
export const UserCriteriaSchema = z.object({
  id: z.string().or(z.number()),
  name: z.string(),
})

export const GenreCriteriaSchema = z.object({
  id: z.string().or(z.number()),
  name: z.string(),
})

// Then define the value types
export const ConditionValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.array(z.number()),
  UserCriteriaSchema,
  GenreCriteriaSchema,
  z.array(z.union([z.string(), z.number()])),
  z
    .object({ min: z.number().optional(), max: z.number().optional() })
    .refine((v) => v.min !== undefined || v.max !== undefined, {
      message: 'Range comparison requires at least min or max to be specified',
    }),
  z.null(),
])

// Then define the interfaces
export interface ICondition {
  field: string
  operator: ComparisonOperator
  value: z.infer<typeof ConditionValueSchema>
  negate?: boolean
  _cid?: string
}

export const ConditionSchema = z
  .object({
    field: z.string(),
    operator: ComparisonOperatorSchema,
    value: ConditionValueSchema,
    negate: z.boolean().optional(),
    _cid: z.string().optional(),
  })
  .refine(
    (cond) => {
      // Validate that condition has complete data
      const hasField = Boolean(cond.field)
      const hasOperator = Boolean(cond.operator)
      const hasValue = isNonEmptyValue(cond.value)

      return hasField && hasOperator && hasValue
    },
    {
      message: 'Condition must have field, operator, and value',
    },
  )

export interface IConditionGroup {
  operator: 'AND' | 'OR'
  conditions: (ICondition | IConditionGroup)[]
  negate?: boolean
  _cid?: string
}

// Helper function to validate group recursion safely, preventing stack overflow and circular references
const isValidConditionGroup = (
  group: IConditionGroup,
  depth = 0,
  visited = new WeakSet(),
): boolean => {
  // Guard against excessive nesting (prevent stack overflow)
  if (depth > 20) {
    return false
  }

  // Guard against circular references (prevent infinite loops)
  if (visited.has(group)) {
    return false
  }
  visited.add(group)

  if (!group.conditions || group.conditions.length === 0) {
    return true // Allow empty conditions in base schema
  }

  return group.conditions.every((cond) => {
    if ('conditions' in cond) {
      // Recursive check for nested groups with increased depth counter
      return isValidConditionGroup(cond as IConditionGroup, depth + 1, visited)
    }
    // Validate individual conditions explicitly since nested groups use z.any()
    return ConditionSchema.safeParse(cond).success
  })
}

// For OpenAPI compatibility, define a simplified condition group that avoids infinite recursion
// This allows conditions OR a simple object with operator/conditions but no deep nesting in OpenAPI docs
export const ConditionGroupSchema = z
  .object({
    operator: z.enum(['AND', 'OR']),
    conditions: z
      .array(
        z.union([
          ConditionSchema,
          // For docs, we'll allow any object structure for nested groups to avoid z.lazy()
          z.object({
            operator: z.enum(['AND', 'OR']),
            conditions: z.array(z.any()).max(20),
            negate: z.boolean().optional(),
            _cid: z.string().optional(),
          }),
        ]),
      )
      .max(20),
    negate: z.boolean().optional(),
    _cid: z.string().optional(),
  })
  .refine((group) => isValidConditionGroup(group), {
    message:
      'Condition groups cannot contain circular references or exceed maximum nesting depth (20)',
  })

// Base router rule schema
export const BaseRouterRuleSchema = z.object({
  name: z.string().min(1, { error: 'Name is required' }),
  target_type: z.enum(['sonarr', 'radarr']),
  target_instance_id: z.number().min(1),
  condition: z.union([ConditionSchema, ConditionGroupSchema]).optional(),
  root_folder: z.string().optional(),
  quality_profile: z.union([z.number(), z.string()]).optional(),
  tags: z.array(z.string()).optional().default([]),
  order: z.number().optional(),
  enabled: z.boolean().optional().default(true),
  search_on_add: z.boolean().nullable().optional(),
  // For Sonarr only - sending this with Radarr rules will be rejected by the API
  // Additional validation happens in the route handlers
  season_monitoring: z.string().nullable().optional(),
  series_type: z.enum(SERIES_TYPES).nullable().optional(),
  // Actions - approval behavior
  always_require_approval: z.boolean().optional().default(false),
  bypass_user_quotas: z.boolean().optional().default(false),
  approval_reason: z.string().optional(),
})

// For the ConditionalRouteFormSchema (used in the frontend)
export const ConditionalRouteFormSchema = z.object({
  name: z.string().min(2, {
    error: 'Route name must be at least 2 characters.',
  }),
  condition: ConditionGroupSchema.refine(
    (val) => {
      // Helper function to validate a single condition (checks for complete data)
      const isValidCondition = (cond: ICondition) => {
        if ('field' in cond && 'operator' in cond && 'value' in cond) {
          const hasField = Boolean(cond.field)
          const hasOperator = Boolean(cond.operator)
          const hasValue =
            cond.value !== undefined &&
            cond.value !== null &&
            (typeof cond.value !== 'string' || cond.value.trim() !== '') &&
            (!Array.isArray(cond.value) || cond.value.length > 0)

          return hasField && hasOperator && hasValue
        }
        return false
      }

      // Helper function to recursively validate condition groups with safeguards
      const isValidGroup = (
        group: IConditionGroup,
        depth = 0,
        visited = new WeakSet(),
      ): boolean => {
        // Guard against excessive nesting
        if (depth > 20) {
          return false
        }

        // Guard against circular references
        if (visited.has(group)) {
          return false
        }
        visited.add(group)

        if (!group.conditions || group.conditions.length === 0) {
          return false // Frontend validation requires at least one condition
        }

        return group.conditions.every((cond) => {
          if ('conditions' in cond) {
            // Recursive check for nested groups
            return isValidGroup(cond as IConditionGroup, depth + 1, visited)
          }

          // Check individual condition
          return isValidCondition(cond as ICondition)
        })
      }

      return isValidGroup(val)
    },
    {
      message: 'All conditions must be completely filled out',
    },
  ),
  target_instance_id: z.number().min(1, {
    error: 'Instance selection is required.',
  }),
  root_folder: z.string().min(1, {
    error: 'Root folder is required.',
  }),
  quality_profile: z.string().min(1, {
    error: 'Quality Profile is required',
  }),
  tags: z.array(z.string()).optional().default([]),
  enabled: z.boolean().default(true),
  order: z.number().int().min(1).max(100).default(50),
})

// Plugin schema
export const ContentRouterPluginsResponseSchema = z.object({
  success: z.boolean(),
  plugins: z.array(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      version: z.string().optional(),
    }),
  ),
})

// Schema for creating a new rule
export const ContentRouterRuleSchema = BaseRouterRuleSchema

// Schema for updating an existing rule
export const ContentRouterRuleUpdateSchema = BaseRouterRuleSchema.partial()

// Schema for toggling a rule
export const ContentRouterRuleToggleSchema = z.object({
  enabled: z.boolean(),
})

// Response schemas
export const RouterRuleSchema = BaseRouterRuleSchema.extend({
  id: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
})

export const ContentRouterRuleResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  rule: RouterRuleSchema,
})

export const ContentRouterRuleListResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  rules: z.array(RouterRuleSchema),
})

export const ContentRouterRuleSuccessSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})

export const ContentRouterRuleErrorSchema = z.object({
  message: z.string(),
})

// Export inferred types
export type ComparisonOperator = z.infer<typeof ComparisonOperatorSchema>
export type ConditionValue = z.infer<typeof ConditionValueSchema>
export type Condition = z.infer<typeof ConditionSchema>
export type ConditionGroup = z.infer<typeof ConditionGroupSchema>
export type BaseRouterRule = z.infer<typeof BaseRouterRuleSchema>
export type ContentRouterPluginsResponse = z.infer<
  typeof ContentRouterPluginsResponseSchema
>
export type ContentRouterRule = z.infer<typeof RouterRuleSchema>
export type ContentRouterRuleUpdate = z.infer<
  typeof ContentRouterRuleUpdateSchema
>

/**
 * Normalizes the input for the `search_on_add` field to a boolean or `undefined`.
 *
 * Returns `undefined` if the input is `null` or `undefined`; otherwise, returns the boolean equivalent of the input.
 *
 * @param value - Input to normalize for the `search_on_add` field.
 * @returns The boolean value of the input, or `undefined` if the input is `null` or `undefined`.
 */
export function normalizeSearchOnAdd(value: unknown): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  return Boolean(value)
}

/**
 * Normalizes the input to a valid season monitoring option in lowercase.
 *
 * Converts the input to a lowercase string and returns it if it matches a valid season monitoring option; returns 'all' if the input is invalid, or undefined if the input is null or undefined.
 *
 * @param value - The value to normalize as a season monitoring option.
 * @returns The normalized season monitoring value, or undefined if the input is null or undefined.
 */
export function normalizeSeasonMonitoring(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined
  }

  const strValue = String(value).toLowerCase()

  return VALID_SEASON_MONITORING.has(strValue) ? strValue : 'all'
}
export type ContentRouterRuleToggle = z.infer<
  typeof ContentRouterRuleToggleSchema
>
export type ContentRouterRuleResponse = z.infer<
  typeof ContentRouterRuleResponseSchema
>
export type ContentRouterRuleListResponse = z.infer<
  typeof ContentRouterRuleListResponseSchema
>
export type ContentRouterRuleSuccess = z.infer<
  typeof ContentRouterRuleSuccessSchema
>
export type ContentRouterRuleError = z.infer<
  typeof ContentRouterRuleErrorSchema
>

