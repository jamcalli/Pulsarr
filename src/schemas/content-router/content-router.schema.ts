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
])

// Define schemas recursively for nested conditions
export const ConditionSchema: z.ZodType = z.lazy(() =>
  z.object({
    field: z.string(),
    operator: ComparisonOperatorSchema,
    value: z.unknown(), // Allow any value type to support different evaluators
    negate: z.boolean().optional().default(false),
  }),
)

export const ConditionGroupSchema: z.ZodType = z.lazy(() =>
  z.object({
    operator: z.enum(['AND', 'OR']),
    conditions: z.array(z.union([ConditionSchema, ConditionGroupSchema])),
    negate: z.boolean().optional().default(false),
  }),
)

// Base router rule schema
export const BaseRouterRuleSchema = z.object({
  name: z.string(),
  target_type: z.enum(['sonarr', 'radarr']),
  target_instance_id: z.number(),
  condition: z.union([ConditionSchema, ConditionGroupSchema]),
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
export type Condition = z.infer<typeof ConditionSchema>
export type ConditionGroup = z.infer<typeof ConditionGroupSchema>
export type BaseRouterRule = z.infer<typeof BaseRouterRuleSchema>
export type ContentRouterPluginsResponse = z.infer<typeof ContentRouterPluginsResponseSchema>
export type ContentRouterRule = z.infer<typeof RouterRuleSchema>
export type ContentRouterRuleUpdate = z.infer<typeof ContentRouterRuleUpdateSchema>
export type ContentRouterRuleToggle = z.infer<typeof ContentRouterRuleToggleSchema>
export type ContentRouterRuleResponse = z.infer<typeof ContentRouterRuleResponseSchema>
export type ContentRouterRuleListResponse = z.infer<typeof ContentRouterRuleListResponseSchema>
export type ContentRouterRuleSuccess = z.infer<typeof ContentRouterRuleSuccessSchema>
export type ContentRouterRuleError = z.infer<typeof ContentRouterRuleErrorSchema>
