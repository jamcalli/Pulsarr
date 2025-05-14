import { z } from 'zod'

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
  value: z.infer<typeof ConditionValueSchema> | null
  negate?: boolean
  _cid?: string
}

export const ConditionSchema: z.ZodType<ICondition> = z.lazy(() =>
  z.object({
    field: z.string(),
    operator: ComparisonOperatorSchema,
    value: ConditionValueSchema,
    negate: z.boolean().optional().default(false),
    _cid: z.string().optional(),
  }),
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
    return true // Individual conditions validated by their own schema
  })
}

export const ConditionGroupSchema: z.ZodType<IConditionGroup> = z.lazy(() =>
  z
    .object({
      operator: z.enum(['AND', 'OR']),
      conditions: z.array(
        z.union([ConditionSchema, z.lazy(() => ConditionGroupSchema)]),
      ),
      negate: z.boolean().optional().default(false),
      _cid: z.string().optional(),
    })
    .refine((group) => isValidConditionGroup(group), {
      message:
        'Condition groups cannot contain circular references or exceed maximum nesting depth (20)',
    }),
)

// Base router rule schema
export const BaseRouterRuleSchema = z.object({
  name: z.string().min(1, { message: 'Name is required' }),
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
  series_type: z.enum(['standard', 'anime', 'daily']).nullable().optional(),
})

// For the ConditionalRouteFormSchema (used in the frontend)
export const ConditionalRouteFormSchema = z.object({
  name: z.string().min(2, {
    message: 'Route name must be at least 2 characters.',
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
    message: 'Instance selection is required.',
  }),
  root_folder: z.string().min(1, {
    message: 'Root folder is required.',
  }),
  quality_profile: z.string().min(1, {
    message: 'Quality Profile is required',
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
 * Converts a value to a boolean for the `search_on_add` field, or returns `undefined` if the input is `null` or `undefined`.
 *
 * @param value - The value to normalize.
 * @returns A boolean representation of {@link value}, or `undefined` if {@link value} is `null` or `undefined`.
 */
export function normalizeSearchOnAdd(value: unknown): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  return Boolean(value)
}

/**
 * Normalizes a season monitoring value to a valid lowercase string.
 *
 * Converts the input to a lowercase string and returns it if it matches a valid season monitoring option; returns 'all' if the input is invalid, or undefined if the input is null or undefined.
 *
 * @param value - The season monitoring value to normalize.
 * @returns The normalized season monitoring value, or undefined if the input is null or undefined.
 */
export function normalizeSeasonMonitoring(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined
  }

  const validValues = [
    'unknown',
    'all',
    'future',
    'missing',
    'existing',
    'firstSeason',
    'lastSeason',
    'latestSeason',
    'pilot',
    'recent',
    'monitorSpecials',
    'unmonitorSpecials',
    'none',
    'skip',
  ]
  const strValue = String(value).toLowerCase()

  return validValues.includes(strValue) ? strValue : 'all'
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
