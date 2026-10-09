import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { ROUTING_FAILURE_CATEGORIES } from '@root/types/routing-failure.types.js'
import { z } from 'zod'

export const RoutingFailureCategorySchema = z.enum(ROUTING_FAILURE_CATEGORIES)

const RoutingFailureSchema = z.object({
  id: z.number(),
  watchlist_item_id: z.number(),
  user_id: z.number(),
  username: z.string(),
  key: z.string(),
  title: z.string(),
  type: z.string(),
  thumb: z.string().nullable(),
  instance_type: z.enum(['radarr', 'sonarr']).nullable(),
  instance_id: z.number().nullable(),
  instance_name: z.string().nullable(),
  category: RoutingFailureCategorySchema,
  message: z.string(),
  first_failed_at: z.string(),
  last_failed_at: z.string(),
  attempt_count: z.number(),
})

// List Filter Schema
export const RoutingFailureFiltersSchema = z.object({
  userId: z.coerce.number().int().positive().optional(),
  category: RoutingFailureCategorySchema.optional(),
})

// Get Routing Failures Schema
export const GetRoutingFailuresResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  failures: z.array(RoutingFailureSchema),
})

// Get Routing Failure Summary Schema
export const GetRoutingFailureSummaryResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  summary: z.object({
    total: z.number(),
    actionable: z.number(),
    byCategory: z.record(RoutingFailureCategorySchema, z.number()),
    byUser: z.array(
      z.object({
        userId: z.number(),
        total: z.number(),
        actionable: z.number(),
      }),
    ),
  }),
})

// Retry Schemas
export const RetryRoutingFailureParamsSchema = z.object({
  watchlistItemId: z.coerce.number().int().positive(),
})

// Without a category, retry-all leaves out items that only miss their IDs
export const RetryRoutingFailuresBodySchema = z
  .object({
    userId: z.number().int().positive().optional(),
    category: RoutingFailureCategorySchema.optional(),
  })
  .optional()

export const RetryRoutingFailuresResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  result: z.object({
    attempted: z.number(),
    resolved: z.number(),
    stillFailing: z.number(),
    skipped: z.number(),
  }),
})

// Exported inferred types
export type RoutingFailureFilters = z.infer<typeof RoutingFailureFiltersSchema>
export type GetRoutingFailuresResponse = z.infer<
  typeof GetRoutingFailuresResponseSchema
>
export type GetRoutingFailureSummaryResponse = z.infer<
  typeof GetRoutingFailureSummaryResponseSchema
>
export type RetryRoutingFailureParams = z.infer<
  typeof RetryRoutingFailureParamsSchema
>
export type RetryRoutingFailuresBody = z.infer<
  typeof RetryRoutingFailuresBodySchema
>
export type RetryRoutingFailuresResponse = z.infer<
  typeof RetryRoutingFailuresResponseSchema
>

// Re-export shared error schema with domain-specific alias
export { ErrorSchema as RoutingFailureErrorSchema }
export type RoutingFailureError = z.infer<typeof ErrorSchema>
