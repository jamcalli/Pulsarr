import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { SERIES_TYPES } from '@root/schemas/content-router/constants.js'
import { isRegexPatternSafe } from '@root/schemas/shared/regex-validation.schema.js'
import { z } from 'zod'

export { SERIES_TYPES }

function isNonEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.length > 0

  // Handle compound IMDB objects
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>

    // Check if this is a compound IMDB value
    if ('rating' in obj || 'votes' in obj) {
      const hasValidRating = obj.rating !== undefined && obj.rating !== null
      const hasValidVotes = obj.votes !== undefined && obj.votes !== null
      return hasValidRating || hasValidVotes
    }

    // Handle range objects ({ min, max })
    if ('min' in obj || 'max' in obj) {
      return obj.min != null || obj.max != null
    }
  }

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

export const UserCriteriaSchema = z.object({
  id: z.string().or(z.number()),
  name: z.string(),
})

export const GenreCriteriaSchema = z.object({
  id: z.string().or(z.number()),
  name: z.string(),
})

const ImdbCompoundValueSchema = z
  .object({
    rating: z
      .union([
        z.number(),
        z.array(z.number()).min(1),
        z
          .object({ min: z.number().optional(), max: z.number().optional() })
          .refine((v) => v.min !== undefined || v.max !== undefined, {
            message:
              'Range comparison requires at least min or max to be specified',
          }),
      ])
      .optional(),
    votes: z
      .union([
        z.number(),
        z.array(z.number()).min(1),
        z
          .object({ min: z.number().optional(), max: z.number().optional() })
          .refine((v) => v.min !== undefined || v.max !== undefined, {
            message:
              'Range comparison requires at least min or max to be specified',
          }),
      ])
      .optional(),
  })
  .refine((val) => val.rating !== undefined || val.votes !== undefined, {
    message: 'At least one of rating or votes must be provided',
  })

export const ConditionValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.array(z.number()),
  UserCriteriaSchema,
  GenreCriteriaSchema,
  z.array(z.union([z.string(), z.number()])),
  z.object({ min: z.number().optional(), max: z.number().optional() }),
  ImdbCompoundValueSchema,
  z.null(),
])

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
    negate: z.boolean().optional().default(false),
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
  .refine(
    (cond) => {
      if (cond.operator !== 'regex') return true
      if (typeof cond.value !== 'string') return false
      return isRegexPatternSafe(cond.value)
    },
    {
      message:
        'Invalid or unsafe regex pattern. Must be valid syntax without catastrophic backtracking.',
    },
  )

export interface IConditionGroup {
  operator: 'AND' | 'OR'
  conditions: (ICondition | IConditionGroup)[]
  negate?: boolean
  _cid?: string
}

function isConditionGroupObject(value: unknown): value is IConditionGroup {
  return (
    value !== null &&
    typeof value === 'object' &&
    'operator' in value &&
    'conditions' in value &&
    Array.isArray((value as unknown as Record<string, unknown>).conditions)
  )
}

const isValidConditionGroup = (
  group: IConditionGroup,
  depth = 0,
  visited = new WeakSet(),
): boolean => {
  if (depth > 20) {
    return false
  }

  if (visited.has(group)) {
    return false
  }
  visited.add(group)

  if (!group.conditions || group.conditions.length === 0) {
    return true // Allow empty conditions in base schema
  }

  return group.conditions.every((cond) => {
    if (isConditionGroupObject(cond)) {
      return isValidConditionGroup(cond, depth + 1, visited)
    }
    return ConditionSchema.safeParse(cond).success
  })
}

// Simplified shape avoids z.lazy() so OpenAPI generation works without infinite recursion.
// Runtime validation of nested groups is handled by isValidConditionGroup's refine.
export const ConditionGroupSchema = z
  .object({
    operator: z.enum(['AND', 'OR']),
    conditions: z
      .array(
        z.union([
          ConditionSchema,
          z.object({
            operator: z.enum(['AND', 'OR']),
            conditions: z.array(z.any()).max(20),
            negate: z.boolean().optional().default(false),
            _cid: z.string().optional(),
          }),
        ]),
      )
      .max(20),
    negate: z.boolean().optional().default(false),
    _cid: z.string().optional(),
  })
  .refine((group) => isValidConditionGroup(group), {
    message:
      'Condition groups cannot contain circular references or exceed maximum nesting depth (20)',
  })

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
  // Sonarr only - Radarr rules with this set are rejected by route handlers
  season_monitoring: z.string().nullable().optional(),
  series_type: z.enum(SERIES_TYPES).nullable().optional(),
  // Radarr only
  monitor: z
    .enum(['movieOnly', 'movieAndCollection', 'none'])
    .nullable()
    .optional(),
  always_require_approval: z.boolean().optional().default(false),
  bypass_user_quotas: z.boolean().optional().default(false),
  approval_reason: z.string().optional(),
})

export const ConditionalRouteFormSchema = z.object({
  name: z.string().min(2, {
    error: 'Route name must be at least 2 characters.',
  }),
  condition: ConditionGroupSchema.refine(
    (val) =>
      isValidConditionGroup(val) &&
      Array.isArray(val.conditions) &&
      val.conditions.length > 0,
    { message: 'All conditions must be completely filled out' },
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

export const ContentRouterPluginsResponseSchema = z.object({
  success: z.boolean(),
  plugins: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      priority: z.number(),
    }),
  ),
})

export const ContentRouterRuleSchema = BaseRouterRuleSchema

export const ContentRouterRuleUpdateSchema = BaseRouterRuleSchema.partial()

export const ContentRouterRuleToggleSchema = z.object({
  enabled: z.boolean(),
})

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

export function normalizeSearchOnAdd(value: unknown): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  return Boolean(value)
}

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

export { ErrorSchema as ContentRouterRuleErrorSchema }
export type ContentRouterRuleError = z.infer<typeof ErrorSchema>
