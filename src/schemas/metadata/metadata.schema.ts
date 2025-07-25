import { z } from 'zod'

// Watchlist user result schema for metadata refresh response
export const WatchlistUserResultSchema = z.object({
  total: z.number(),
  users: z.array(z.any()),
})

// Metadata refresh success response schema
export const MetadataRefreshSuccessResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  totalItems: z.number(),
  selfItems: z.number(),
  othersItems: z.number(),
})

// Metadata refresh error response schema
export const MetadataRefreshErrorResponseSchema = z.object({
  success: z.boolean().default(false),
  message: z.string(),
})

// Type exports
export type MetadataRefreshSuccessResponse = z.infer<
  typeof MetadataRefreshSuccessResponseSchema
>
export type MetadataRefreshErrorResponse = z.infer<
  typeof MetadataRefreshErrorResponseSchema
>
export type WatchlistUserResult = z.infer<typeof WatchlistUserResultSchema>
