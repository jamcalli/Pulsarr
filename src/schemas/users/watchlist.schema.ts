import { z } from 'zod'

// Watchlist item schema for the response
const WatchlistItemSchema = z.object({
  title: z.string(),
  key: z.string(),
  type: z.string(),
  thumb: z.string().nullable(),
  guids: z.array(z.string()),
  genres: z.array(z.string()),
  status: z.enum(['pending', 'requested', 'grabbed', 'notified']),
  added: z.string().nullable(),
})

// User info schema
const UserInfoSchema = z.object({
  id: z.number(),
  name: z.string(),
})

// Request params schema
export const GetUserWatchlistParamsSchema = z.object({
  userId: z.string().transform(Number),
})

// Success response schema
export const GetUserWatchlistResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.object({
    user: UserInfoSchema,
    watchlistItems: z.array(WatchlistItemSchema),
    total: z.number(),
  }),
})

// Error response schema
export const GetUserWatchlistErrorSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})

// Export types
export type GetUserWatchlistParams = z.infer<
  typeof GetUserWatchlistParamsSchema
>
export type GetUserWatchlistResponse = z.infer<
  typeof GetUserWatchlistResponseSchema
>
export type GetUserWatchlistError = z.infer<typeof GetUserWatchlistErrorSchema>
export type WatchlistItem = z.infer<typeof WatchlistItemSchema>
