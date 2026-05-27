import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

// Common Watchlist Exclusion Schema
const WatchlistExclusionSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  key: z.string(),
  title: z.string(),
  type: z.string(),
  guids: z.array(z.string()),
  excluded_at: z.string(),
})

const WatchlistExclusionWithUserSchema = WatchlistExclusionSchema.extend({
  username: z.string(),
})

// Create Watchlist Exclusion Schema
export const CreateWatchlistExclusionSchema = z.object({
  key: z.string().trim().min(1, { error: 'Key is required' }),
  userIds: z
    .array(z.number())
    .min(1, { error: 'At least one user ID is required' }),
  title: z.string().trim().min(1, { error: 'Title is required' }),
  type: z.string().trim().min(1, { error: 'Type is required' }),
  guids: z.array(z.string()).default([]),
})

export const CreateWatchlistExclusionResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  created: z.number(),
})

// Get All Watchlist Exclusions Schema
export const GetWatchlistExclusionsResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  exclusions: z.array(WatchlistExclusionWithUserSchema),
})

// Get User Watchlist Exclusions Schema
export const GetUserWatchlistExclusionsParamsSchema = z.object({
  userId: z.coerce.number(),
})

export const GetUserWatchlistExclusionsResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  exclusions: z.array(WatchlistExclusionSchema),
})

// Remove Watchlist Exclusion Schema
export const RemoveWatchlistExclusionParamsSchema = z.object({
  id: z.coerce.number(),
})

export const RemoveWatchlistExclusionResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})

// Exported inferred types
export type CreateWatchlistExclusion = z.infer<
  typeof CreateWatchlistExclusionSchema
>
export type CreateWatchlistExclusionResponse = z.infer<
  typeof CreateWatchlistExclusionResponseSchema
>
export type GetWatchlistExclusionsResponse = z.infer<
  typeof GetWatchlistExclusionsResponseSchema
>
export type GetUserWatchlistExclusionsParams = z.infer<
  typeof GetUserWatchlistExclusionsParamsSchema
>
export type GetUserWatchlistExclusionsResponse = z.infer<
  typeof GetUserWatchlistExclusionsResponseSchema
>
export type RemoveWatchlistExclusionParams = z.infer<
  typeof RemoveWatchlistExclusionParamsSchema
>
export type RemoveWatchlistExclusionResponse = z.infer<
  typeof RemoveWatchlistExclusionResponseSchema
>

// Re-export shared error schema with domain-specific alias
export { ErrorSchema as WatchlistExclusionErrorSchema }
export type WatchlistExclusionError = z.infer<typeof ErrorSchema>
