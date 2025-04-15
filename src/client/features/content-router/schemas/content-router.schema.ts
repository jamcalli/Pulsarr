import { z } from 'zod'

// Define schemas for condition value types
const ConditionValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.array(z.number()),
  z.object({
    min: z.number().optional(),
    max: z.number().optional(),
  }),
])

// Define schema for a basic condition
export const ConditionSchema: z.ZodType<ICondition> = z.lazy(() =>
  z.object({
    field: z.string().min(1, { message: 'Field is required' }),
    operator: z.string().min(1, { message: 'Operator is required' }),
    value: ConditionValueSchema,
    negate: z.boolean().optional().default(false),
  }),
)

// Define schema for a condition group (which can contain nested conditions and groups)
export const ConditionGroupSchema: z.ZodType<IConditionGroup> = z.lazy(() =>
  z.object({
    operator: z.enum(['AND', 'OR']),
    conditions: z
      .array(z.union([ConditionSchema, ConditionGroupSchema]))
      .min(1),
    negate: z.boolean().optional().default(false),
  }),
)

// Schema for a conditional route
export const ConditionalRouteFormSchema = z.object({
  name: z.string().min(2, {
    message: 'Route name must be at least 2 characters.',
  }),
  condition: ConditionGroupSchema,
  target_instance_id: z.number().min(1, {
    message: 'Instance selection is required.',
  }),
  root_folder: z.string().min(1, {
    message: 'Root folder is required.',
  }),
  quality_profile: z.string().min(1, {
    message: 'Quality Profile is required',
  }),
  enabled: z.boolean().default(true),
  order: z.number().int().min(1).max(100).default(50),
})

export type ConditionalRouteFormValues = z.infer<
  typeof ConditionalRouteFormSchema
>

// Type definitions for conditions
export type ConditionValue = z.infer<typeof ConditionValueSchema>

export interface ICondition {
  field: string
  operator: string
  value: ConditionValue
  negate?: boolean
}

export interface IConditionGroup {
  operator: 'AND' | 'OR'
  conditions: (ICondition | IConditionGroup)[]
  negate?: boolean
}
