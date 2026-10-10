import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import {
  type InstanceType,
  InstanceTypeSchema,
} from '@root/schemas/common/instance-type.schema.js'
import {
  RoutingMonitorSchema,
  RoutingQualityProfileInputSchema,
  RoutingQualityProfileSchema,
  RoutingRootFolderInputSchema,
  RoutingRootFolderSchema,
  RoutingSearchOnAddSchema,
  RoutingSeasonMonitoringSchema,
  RoutingSeriesTypeSchema,
  RoutingTagsSchema,
} from '@root/schemas/common/routing-target.schema.js'
import {
  fieldAllowsOperator,
  isRouterField,
  ROUTER_FIELDS,
} from '@root/schemas/content-router/router-fields.js'
import { isRegexPatternSafe } from '@root/schemas/shared/regex-validation.schema.js'
import { z } from 'zod'

export const ROUTER_RULE_PRIORITY = { min: 1, max: 100 } as const
export const DEFAULT_ROUTE_PRIORITY = 50

export const ROUTER_GROUP_MAX_CONDITIONS = 20

/** Deepest nesting level a group may sit at, the root group being level 0. */
export const ROUTER_GROUP_MAX_DEPTH = 20

const PRIORITY_RANGE_ERROR = `Priority must be ${ROUTER_RULE_PRIORITY.min} to ${ROUTER_RULE_PRIORITY.max}.`

/** Required here, the payloads wrap it in `.optional()` because the server defaults a missing order. */
const PRIORITY_REQUIRED_ERROR = 'Enter a priority.'

export const RouterRulePrioritySchema = z
  .number({ error: PRIORITY_REQUIRED_ERROR })
  .int({ error: 'Priority must be a whole number.' })
  .min(ROUTER_RULE_PRIORITY.min, { error: PRIORITY_RANGE_ERROR })
  .max(ROUTER_RULE_PRIORITY.max, { error: PRIORITY_RANGE_ERROR })

/** Priority for one rule, where the order already stored on it passes even outside the range. */
export function routerRulePriorityFor(stored: number | null) {
  return z
    .number({ error: PRIORITY_REQUIRED_ERROR })
    .superRefine((order, ctx) => {
      if (order === stored) return
      const issue = RouterRulePrioritySchema.safeParse(order).error?.issues[0]
      if (issue) ctx.addIssue({ code: 'custom', message: issue.message })
    })
}

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
export const ConditionRangeSchema = z
  .object({ min: z.number().optional(), max: z.number().optional() })
  .strict()
  .meta({
    id: 'ConditionRange',
    description: 'Inclusive numeric range, either bound may be left open',
  })

const BoundedConditionRangeSchema = ConditionRangeSchema.refine(
  (v) => v.min !== undefined || v.max !== undefined,
  { message: 'Range comparison requires at least min or max to be specified' },
)

const RatingComparisonValueSchema = z.union([
  z.number(),
  z.array(z.number()).min(1),
  BoundedConditionRangeSchema,
])

export const ImdbConditionValueSchema = z
  .object({
    rating: RatingComparisonValueSchema.optional(),
    votes: z.number().optional(),
  })
  .strict()
  .refine((val) => val.rating !== undefined || val.votes !== undefined, {
    message: 'At least one of rating or votes must be provided',
  })
  .meta({
    id: 'ImdbConditionValue',
    description: 'IMDb rating comparison with an optional minimum vote count',
  })

const ScalarConditionValueSchemas = [
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.array(z.number()),
  z.array(z.union([z.string(), z.number()])),
] as const

export const ConditionValueSchema = z
  .union([
    ...ScalarConditionValueSchemas,
    ImdbConditionValueSchema,
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
  .superRefine((cond, ctx) => {
    if (!isRouterField(cond.field)) {
      ctx.addIssue({
        code: 'custom',
        path: ['field'],
        message: `Unknown condition field "${cond.field}"`,
      })
    } else if (!fieldAllowsOperator(cond.field, cond.operator)) {
      ctx.addIssue({
        code: 'custom',
        path: ['operator'],
        message: `Operator "${cond.operator}" is not supported for field "${cond.field}"`,
      })
    }
  })
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

export const RouterGroupOperatorSchema = z.enum(['AND', 'OR']).meta({
  id: 'RouterGroupOperator',
  description: 'How a condition group joins its children',
})

export interface IConditionGroup {
  operator: z.infer<typeof RouterGroupOperatorSchema>
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

const GROUP_SHAPE_MESSAGE = `Condition groups must use AND or OR, hold at most ${ROUTER_GROUP_MAX_CONDITIONS} conditions, and cannot contain circular references or exceed maximum nesting depth (${ROUTER_GROUP_MAX_DEPTH})`

const conditionGroupIssue = (
  group: IConditionGroup,
  depth = 0,
  visited = new WeakSet(),
): string | undefined => {
  if (depth > ROUTER_GROUP_MAX_DEPTH || visited.has(group)) {
    return GROUP_SHAPE_MESSAGE
  }
  visited.add(group)

  if (group.operator !== 'AND' && group.operator !== 'OR') {
    return GROUP_SHAPE_MESSAGE
  }

  if (!group.conditions || group.conditions.length === 0) {
    return undefined
  }

  if (group.conditions.length > ROUTER_GROUP_MAX_CONDITIONS) {
    return GROUP_SHAPE_MESSAGE
  }

  for (const cond of group.conditions) {
    if (isConditionGroupObject(cond)) {
      const issue = conditionGroupIssue(cond, depth + 1, visited)
      if (issue) return issue
      continue
    }
    const result = ConditionSchema.safeParse(cond)
    if (!result.success) {
      return result.error.issues[0]?.message ?? 'Invalid condition'
    }
  }
  return undefined
}

function conditionLeaves(
  node: ICondition | IConditionGroup,
  depth = 0,
): ICondition[] {
  if (!isConditionGroupObject(node)) return [node]
  if (depth > ROUTER_GROUP_MAX_DEPTH) return []
  return node.conditions.flatMap((child) => conditionLeaves(child, depth + 1))
}

function fieldsOutsideTarget(
  condition: ICondition | IConditionGroup,
  targetType: InstanceType,
): string[] {
  return conditionLeaves(condition)
    .map((leaf) => leaf.field)
    .filter((field) => {
      // an unknown field is reported by the condition check
      if (!isRouterField(field)) return false
      const { appliesTo } = ROUTER_FIELDS[field]
      return appliesTo !== 'both' && appliesTo !== targetType
    })
}

// For OpenAPI compatibility, define a simplified condition group that avoids infinite recursion
// This allows conditions OR a simple object with operator/conditions but no deep nesting in OpenAPI docs
export const ConditionGroupSchema = z
  .object({
    operator: RouterGroupOperatorSchema,
    conditions: z
      .array(
        z.union([
          ConditionSchema,
          // For docs, we'll allow any object structure for nested groups to avoid z.lazy()
          z.object({
            operator: RouterGroupOperatorSchema,
            conditions: z.array(z.any()).max(ROUTER_GROUP_MAX_CONDITIONS),
            negate: z.boolean().optional().default(false),
            _cid: z.string().optional(),
          }),
        ]),
      )
      .max(ROUTER_GROUP_MAX_CONDITIONS),
    negate: z.boolean().optional().default(false),
    _cid: z.string().optional(),
  })
  .superRefine((group, ctx) => {
    const issue = conditionGroupIssue(group)
    if (issue) ctx.addIssue({ code: 'custom', message: issue })
  })
  .meta({
    id: 'RouterConditionGroup',
    description: `Boolean grouping of router conditions, nestable to ${ROUTER_GROUP_MAX_DEPTH} levels`,
  })

// Base router rule schema
export const BaseRouterRuleSchema = z.object({
  name: z.string().min(1, { error: 'Name is required' }),
  target_type: InstanceTypeSchema,
  target_instance_id: z.number().min(1).nullable(),
  condition: z.union([ConditionSchema, ConditionGroupSchema]).optional(),
  root_folder: RoutingRootFolderInputSchema.optional(),
  quality_profile: RoutingQualityProfileSchema.optional(),
  tags: RoutingTagsSchema.optional(),
  order: z.number().int().optional(),
  enabled: z.boolean().optional(),
  search_on_add: RoutingSearchOnAddSchema.optional(),
  season_monitoring: RoutingSeasonMonitoringSchema.optional().meta({
    description:
      'Sonarr rules only - season monitoring mode applied when adding series. Sending this for Radarr rules returns a 400 error.',
  }),
  series_type: RoutingSeriesTypeSchema.optional().meta({
    description:
      'Sonarr rules only - series type applied when adding series. Sending this for Radarr rules returns a 400 error.',
  }),
  monitor: RoutingMonitorSchema.optional().meta({
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

function routerRulePayload<Order extends z.ZodType<number | undefined>>(
  order: Order,
) {
  return BaseRouterRuleSchema.extend({
    quality_profile: RoutingQualityProfileInputSchema.optional(),
    order,
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
    .superRefine((v, ctx) => {
      if (!v.condition) return
      for (const field of fieldsOutsideTarget(v.condition, v.target_type)) {
        ctx.addIssue({
          code: 'custom',
          path: ['condition'],
          message: `Field "${field}" is not supported for ${v.target_type} rules`,
        })
      }
    })
}

export const ContentRouterRuleSchema = routerRulePayload(
  RouterRulePrioritySchema.optional(),
).meta({
  id: 'RouterRulePayload',
  description: 'Full router rule payload used to create a rule',
})

export const ContentRouterRuleUpdateSchema = routerRulePayload(
  z.number().int().optional(),
).meta({
  id: 'RouterRuleReplacePayload',
  description: `Full router rule payload used to replace a rule. An order outside ${ROUTER_RULE_PRIORITY.min} to ${ROUTER_RULE_PRIORITY.max} is accepted only when it is the value already stored on the rule.`,
})

export const ContentRouterRuleToggleSchema = z
  .object({
    enabled: z.boolean(),
  })
  .meta({
    id: 'RouterRuleTogglePayload',
    description: 'Turns a router rule on or off',
  })

const StoredRatingValueSchema = z.union([
  z.number(),
  z.array(z.number()),
  ConditionRangeSchema,
])

const StoredConditionValueSchema = z.union([
  ...ScalarConditionValueSchemas,
  UserCriteriaSchema,
  GenreCriteriaSchema,
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
  operator: RouterGroupOperatorSchema,
  conditions: z.array(
    z.union([
      StoredConditionSchema,
      z.object({
        operator: RouterGroupOperatorSchema,
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
  root_folder: RoutingRootFolderSchema.optional(),
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

export const ContentRouterRuleSuccessSchema = z
  .object({
    success: z.boolean(),
    message: z.string(),
  })
  .meta({
    id: 'RouterRuleSuccess',
    description: 'Result of a router rule write that returns no rule',
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
