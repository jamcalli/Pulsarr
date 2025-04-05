import { z } from 'zod'

// Define schema for CriteriaValue (matching your existing type definition)
export const CriteriaValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.array(z.number()),
  z.object({
    min: z.number().optional(),
    max: z.number().optional(),
  }),
  z.null(),
])

// Type for criteria object with dynamic keys
export const CriteriaSchema = z.record(z.string(), CriteriaValueSchema)

// Content Router rule schema - used for rule creation
export const ContentRouterRuleSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  type: z.string().min(1, 'Type is required'),
  criteria: CriteriaSchema,
  target_type: z.enum(['radarr', 'sonarr']),
  target_instance_id: z.number().int().positive(),
  quality_profile: z.union([z.number(), z.null()]).optional(),
  root_folder: z.string().nullable().optional(),
  enabled: z.boolean().default(true),
  order: z.number().int().default(50),
  metadata: CriteriaSchema.nullable().optional(),
})

// Content Router rule update schema - partial version of ContentRouterRuleSchema
export const ContentRouterRuleUpdateSchema =
  ContentRouterRuleSchema.partial().omit({
    // Don't allow changing the type after creation
    type: true,
  })

// Schema for toggling content router rule enabled/disabled status
export const ContentRouterRuleToggleSchema = z.object({
  enabled: z.boolean(),
})

// Response schema for returning a single content router rule
export const ContentRouterRuleResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  rule: ContentRouterRuleSchema.extend({
    id: z.number(),
    created_at: z.string(),
    updated_at: z.string(),
  }),
})

// Response schema for returning multiple content router rules
export const ContentRouterRuleListResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  rules: z.array(
    ContentRouterRuleSchema.extend({
      id: z.number(),
      created_at: z.string(),
      updated_at: z.string(),
    }),
  ),
})

// Simple success response schema
export const ContentRouterRuleSuccessSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})

// Error response schema
export const ContentRouterRuleErrorSchema = z.object({
  message: z.string(),
})

// Content Router plugins response schema
export const ContentRouterPluginsResponseSchema = z.object({
  success: z.boolean(),
  plugins: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      enabled: z.boolean(),
      order: z.number(),
    }),
  ),
})

// Export TypeScript types
export type ContentRouterRule = z.infer<typeof ContentRouterRuleSchema> & {
  id: number
  created_at: string
  updated_at: string
}
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
export type ContentRouterPluginsResponse = z.infer<
  typeof ContentRouterPluginsResponseSchema
>
export type CriteriaValue = z.infer<typeof CriteriaValueSchema>
export type Criteria = z.infer<typeof CriteriaSchema>
