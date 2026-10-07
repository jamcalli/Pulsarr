import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { InstanceTypeSchema } from '@root/schemas/common/instance-type.schema.js'
import { SERIES_TYPES } from '@root/schemas/content-router/constants.js'
import { RadarrMonitorSchema } from '@root/schemas/radarr/add-options.schema.js'
import { isRegexPatternSafe } from '@root/schemas/shared/regex-validation.schema.js'
import { SonarrSeasonMonitoringValueSchema } from '@root/schemas/sonarr/season-monitoring.schema.js'
import { z } from 'zod'

export { SERIES_TYPES }

/**
 * Determines whether a value should be treated as "non-empty" for validation.
 *
 * Strings that are only whitespace, null, or undefined are considered empty.
 * Empty arrays are considered empty. All other values are considered non-empty.
 *
 * @param value - The value to evaluate.
 * @returns `true` if the value is non-empty; otherwise `false`.
 */
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

// Base schemas for conditions
export const ComparisonOperatorSchema = z
  .enum([
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
  .meta({
    id: 'ConditionOperator',
    description: 'Comparison operator applied to a condition value',
  })

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
const ConditionRangeSchema = z
  .object({ min: z.number().optional(), max: z.number().optional() })
  .strict()

const BoundedConditionRangeSchema = ConditionRangeSchema.refine(
  (v) => v.min !== undefined || v.max !== undefined,
  { message: 'Range comparison requires at least min or max to be specified' },
)

const RatingComparisonValueSchema = z.union([
  z.number(),
  z.array(z.number()).min(1),
  BoundedConditionRangeSchema,
])

// Schema for compound IMDB values (rating with optional votes)
const ImdbCompoundValueSchema = z
  .object({
    rating: RatingComparisonValueSchema.optional(),
    votes: RatingComparisonValueSchema.optional(),
  })
  .strict()
  .refine((val) => val.rating !== undefined || val.votes !== undefined, {
    message: 'At least one of rating or votes must be provided',
  })

const ScalarConditionValueSchemas = [
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.array(z.number()),
  UserCriteriaSchema,
  GenreCriteriaSchema,
  z.array(z.union([z.string(), z.number()])),
] as const

export const ConditionValueSchema = z
  .union([
    ...ScalarConditionValueSchemas,
    ImdbCompoundValueSchema,
    BoundedConditionRangeSchema,
    z.null(),
  ])
  .meta({
    id: 'ConditionValue',
    description: 'Value shapes accepted by router conditions',
  })

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
  .meta({
    id: 'RouterCondition',
    description: 'A single field comparison in a router rule',
  })

export interface IConditionGroup {
  operator: 'AND' | 'OR'
  conditions: (ICondition | IConditionGroup)[]
  negate?: boolean
  _cid?: string
}

// Helper function to check if a value is a condition group
function isConditionGroupObject(value: unknown): value is IConditionGroup {
  return (
    value !== null &&
    typeof value === 'object' &&
    'operator' in value &&
    'conditions' in value &&
    Array.isArray((value as unknown as Record<string, unknown>).conditions)
  )
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

  if (group.operator !== 'AND' && group.operator !== 'OR') {
    return false
  }

  if (!group.conditions || group.conditions.length === 0) {
    return true // Allow empty conditions in base schema
  }

  if (group.conditions.length > 20) {
    return false
  }

  return group.conditions.every((cond) => {
    // Check if this is a nested condition group
    if (isConditionGroupObject(cond)) {
      // Recursive check for nested groups with increased depth counter
      return isValidConditionGroup(cond, depth + 1, visited)
    }
    // Validate individual conditions explicitly since nested groups may accept any values in OpenAPI shape
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
      'Condition groups must use AND or OR, hold at most 20 conditions, and cannot contain circular references or exceed maximum nesting depth (20)',
  })
  .meta({
    id: 'RouterConditionGroup',
    description: 'Boolean grouping of router conditions, nestable to 20 levels',
  })

// Base router rule schema
export const BaseRouterRuleSchema = z.object({
  name: z.string().min(1, { error: 'Name is required' }),
  target_type: InstanceTypeSchema,
  target_instance_id: z.number().min(1).nullable(),
  condition: z.union([ConditionSchema, ConditionGroupSchema]).optional(),
  root_folder: z.string().optional(),
  quality_profile: z.union([z.number(), z.string()]).optional(),
  tags: z.array(z.string()).optional(),
  order: z.number().int().optional(),
  enabled: z.boolean().optional(),
  search_on_add: z.boolean().nullable().optional(),
  season_monitoring: SonarrSeasonMonitoringValueSchema.nullable()
    .optional()
    .meta({
      description:
        'Sonarr rules only - season monitoring mode applied when adding series. Sending this for Radarr rules returns a 400 error.',
    }),
  series_type: z
    .enum(SERIES_TYPES)
    .nullable()
    .optional()
    .describe(
      'Sonarr rules only - series type applied when adding series. Sending this for Radarr rules returns a 400 error.',
    ),
  monitor: RadarrMonitorSchema.nullable().optional().meta({
    description:
      'Radarr rules only - monitor mode applied when adding movies. Sending this for Sonarr rules returns a 400 error.',
  }),
  always_require_approval: z.boolean().optional(),
  bypass_user_quotas: z.boolean().optional(),
  approval_reason: z.string().optional(),
  exclude_from_routing: z.boolean().optional(),
})

// Plugin schema
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

// Accepts numeric strings from API clients; unparseable strings become null
const QualityProfileInputSchema = z
  .union([z.number(), z.string()])
  .optional()
  .transform((val) => {
    if (val === undefined || typeof val === 'number') return val
    const parsed = Number.parseInt(val, 10)
    return Number.isFinite(parsed) ? parsed : null
  })
  .pipe(z.number().nullable().optional())

// Schema for creating or replacing a rule. PUT is a full replace, so one
// schema owns every cross-field invariant for both verbs
export const ContentRouterRuleSchema = BaseRouterRuleSchema.extend({
  quality_profile: QualityProfileInputSchema,
})
  .refine((v) => v.target_type !== 'radarr' || v.season_monitoring == null, {
    message: 'season_monitoring field is not supported for Radarr rules',
  })
  .refine((v) => v.target_type !== 'radarr' || v.series_type == null, {
    message: 'series_type field is not supported for Radarr rules',
  })
  .refine((v) => v.target_type !== 'sonarr' || v.monitor == null, {
    message: 'monitor field is not supported for Sonarr rules',
  })
  .refine(
    (v) => v.exclude_from_routing === true || v.target_instance_id != null,
    {
      message:
        'target_instance_id is required unless exclude_from_routing is true',
    },
  )
  .refine(
    (v) => !(v.exclude_from_routing === true && v.target_instance_id != null),
    {
      message:
        'target_instance_id must be null when exclude_from_routing is true',
    },
  )
  .meta({
    id: 'RouterRulePayload',
    description: 'Full router rule payload used to create or replace a rule',
  })

export const ContentRouterRuleUpdateSchema = ContentRouterRuleSchema

// Schema for toggling a rule
export const ContentRouterRuleToggleSchema = z.object({
  enabled: z.boolean(),
})

const StoredRatingValueSchema = z.union([
  z.number(),
  z.array(z.number()),
  ConditionRangeSchema,
])

const StoredConditionValueSchema = z.union([
  ...ScalarConditionValueSchemas,
  z
    .object({
      rating: StoredRatingValueSchema.optional(),
      votes: StoredRatingValueSchema.optional(),
    })
    .strict(),
  ConditionRangeSchema,
  z.null(),
])

const StoredConditionSchema = z.object({
  field: z.string(),
  operator: ComparisonOperatorSchema,
  value: StoredConditionValueSchema,
  negate: z.boolean().optional().default(false),
  _cid: z.string().optional(),
})

const StoredConditionGroupSchema = z.object({
  operator: z.enum(['AND', 'OR']),
  conditions: z.array(
    z.union([
      StoredConditionSchema,
      z.object({
        operator: z.enum(['AND', 'OR']),
        conditions: z.array(z.any()),
        negate: z.boolean().optional().default(false),
        _cid: z.string().optional(),
      }),
    ]),
  ),
  negate: z.boolean().optional().default(false),
  _cid: z.string().optional(),
})

// Response schemas skip the request refinements so one stale stored row cannot fail the whole list
export const RouterRuleSchema = BaseRouterRuleSchema.extend({
  condition: z
    .union([StoredConditionSchema, StoredConditionGroupSchema])
    .optional(),
  order: z.number().nullable(),
  id: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
}).meta({
  id: 'RouterRule',
  description: 'A stored content router rule',
})

export const ContentRouterRuleResponseSchema = z
  .object({
    success: z.boolean(),
    message: z.string(),
    rule: RouterRuleSchema,
  })
  .meta({
    id: 'RouterRuleResponse',
    description: 'Response carrying a single router rule',
  })

export const ContentRouterRuleListResponseSchema = z
  .object({
    success: z.boolean(),
    message: z.string(),
    rules: z.array(RouterRuleSchema),
  })
  .meta({
    id: 'RouterRuleListResponse',
    description: 'Response carrying a list of router rules',
  })

export const ContentRouterRuleSuccessSchema = z.object({
  success: z.boolean(),
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

// Re-export shared error schema with domain-specific alias
export { ErrorSchema as ContentRouterRuleErrorSchema }
export type ContentRouterRuleError = z.infer<typeof ErrorSchema>
