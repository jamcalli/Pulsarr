import { z } from 'zod'

// Define a schema for basic condition (non-group)
export const ConditionSchema = z.object({
  id: z.number().optional(),
  predicate_type: z.string().min(1, 'Predicate type is required'),
  operator: z.string().min(1, 'Operator is required'),
  value: z.any(),
  group_id: z.number().nullable().optional(),
  parent_group_id: z.number().nullable().optional(),
  group_operator: z.string().nullable().optional(),
  order_index: z.number().optional(),
})

// Define a schema for group condition
export const GroupConditionSchema = z.object({
  id: z.number().optional(),
  predicate_type: z.literal('group'),
  operator: z.string().nullable().optional(),
  value: z.any().nullable().optional(),
  group_operator: z.enum(['AND', 'OR', 'NOT']),
  parent_group_id: z.number().nullable().optional(),
  group_id: z.number().nullable().optional(),
  order_index: z.number().optional(),
})

// Combined condition schema (union type)
export const RouterConditionSchema = z.discriminatedUnion('predicate_type', [
  GroupConditionSchema,
  ConditionSchema,
])

// Schema for creating/updating a rule with conditions
export const RouterRuleWithConditionsSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  target_type: z.enum(['radarr', 'sonarr']),
  target_instance_id: z.number().int().positive(),
  quality_profile: z.number().nullable().optional(),
  root_folder: z.string().nullable().optional(),
  weight: z.number().default(50),
  enabled: z.boolean().default(true),
  conditions: z.array(RouterConditionSchema).optional(),
})

// Schema for updating just the rule without conditions
export const RouterRuleUpdateSchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
  description: z.string().nullable().optional(),
  target_instance_id: z.number().int().positive().optional(),
  quality_profile: z.number().nullable().optional(),
  root_folder: z.string().nullable().optional(),
  weight: z.number().optional(),
  enabled: z.boolean().optional(),
})

// Response schema for a rule with conditions
export const RouterRuleWithConditionsResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  rule: z.object({
    id: z.number(),
    name: z.string(),
    description: z.string().nullable(),
    type: z.string(),
    target_type: z.enum(['radarr', 'sonarr']),
    target_instance_id: z.number(),
    quality_profile: z.number().nullable(),
    root_folder: z.string().nullable(),
    weight: z.number(),
    enabled: z.boolean(),
    query_type: z.enum(['legacy', 'query-builder']),
    criteria: z.record(z.any()),
    created_at: z.string(),
    updated_at: z.string(),
    conditions: z.array(
      z.object({
        id: z.number(),
        rule_id: z.number(),
        predicate_type: z.string(),
        operator: z.string(),
        value: z.any(), // We handle parsing in the route handler
        group_id: z.number().nullable(),
        group_operator: z.string().nullable(),
        parent_group_id: z.number().nullable(),
        order_index: z.number(),
        created_at: z.string(),
        updated_at: z.string(),
      }),
    ),
  }),
})

// Error response schema
export const RouterRuleErrorSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})

// Export TypeScript types
export type Condition = z.infer<typeof ConditionSchema>
export type GroupCondition = z.infer<typeof GroupConditionSchema>
export type RouterCondition = z.infer<typeof RouterConditionSchema>
export type RouterRuleWithConditions = z.infer<
  typeof RouterRuleWithConditionsSchema
>
export type RouterRuleUpdate = z.infer<typeof RouterRuleUpdateSchema>
export type RouterRuleWithConditionsResponse = z.infer<
  typeof RouterRuleWithConditionsResponseSchema
>
export type RouterRuleError = z.infer<typeof RouterRuleErrorSchema>
