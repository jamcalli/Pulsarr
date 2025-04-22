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

// First, define the value types
export const ConditionValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string(), z.number()])),
  z
    .object({ min: z.number().optional(), max: z.number().optional() })
    .refine((v) => v.min !== undefined || v.max !== undefined, {
      message: 'Range comparison requires at least min or max to be specified',
    }),
  z.null(),
])

// Then define the types we'll use
export interface ICondition {
  field: string
  operator: z.infer<typeof ComparisonOperatorSchema>
  value: z.infer<typeof ConditionValueSchema>
  negate?: boolean
  _cid?: string
}

export interface IConditionGroup {
  operator: 'AND' | 'OR'
  conditions: (ICondition | IConditionGroup)[]
  negate?: boolean
  _cid?: string
}

// Now define the schemas using these interfaces
export const ConditionSchema: z.ZodType<ICondition> = z.lazy(() =>
  z.object({
    field: z.string(),
    operator: ComparisonOperatorSchema,
    value: ConditionValueSchema,
    negate: z.boolean().optional().default(false),
    _cid: z.string().optional(),
  }),
)

export const ConditionGroupSchema: z.ZodType<IConditionGroup> = z.lazy(() =>
  z.object({
    operator: z.enum(['AND', 'OR']),
    conditions: z.array(
      z.union([ConditionSchema, z.lazy(() => ConditionGroupSchema)]),
    ),
    negate: z.boolean().optional().default(false),
    _cid: z.string().optional(),
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
  order: z.number().optional(),
  enabled: z.boolean().optional().default(true),
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
