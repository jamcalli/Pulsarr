import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

const WatchlistItemSchema = z.object({
  title: z.string(),
  plexKey: z.string().optional(),
  type: z.string(),
  thumb: z.string().optional(),
  guids: z.array(z.string()),
  genres: z.array(z.string()),
})

const UserSchema = z.object({
  watchlistId: z.string(),
  username: z.string(),
})

const UserWatchlistSchema = z.object({
  user: UserSchema,
  watchlist: z.array(WatchlistItemSchema),
})

const SelfWatchlistSuccessSchema = z.object({
  total: z.number(),
  users: z.array(UserWatchlistSchema),
})

export const selfWatchlistSchema = {
  summary: 'Get self watchlist items',
  operationId: 'getSelfWatchlistItems',
  description: 'Retrieve the current user watchlist items from Plex',
  tags: ['Plex'],
  response: {
    200: SelfWatchlistSuccessSchema,
    400: ErrorSchema,
    500: ErrorSchema,
  },
}

export type SelfWatchlistSuccess = z.infer<typeof SelfWatchlistSuccessSchema>
export type WatchlistItem = z.infer<typeof WatchlistItemSchema>
export type User = z.infer<typeof UserSchema>
export type UserWatchlist = z.infer<typeof UserWatchlistSchema>

// Re-export ErrorSchema for domain-specific error type
export { ErrorSchema as SelfWatchlistErrorSchema }
export type SelfWatchlistError = z.infer<typeof ErrorSchema>
