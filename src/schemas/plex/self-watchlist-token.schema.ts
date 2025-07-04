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

const SelfWatchlistErrorSchema = z.object({
  error: z.string(),
})

const SelfWatchlistResponseSchema = z.union([
  SelfWatchlistSuccessSchema,
  SelfWatchlistErrorSchema,
])

export const selfWatchlistSchema = {
  summary: 'Get self watchlist items',
  operationId: 'getSelfWatchlistItems',
  description: 'Retrieve the current user watchlist items from Plex',
  tags: ['Plex'],
  response: {
    200: SelfWatchlistResponseSchema,
  },
}

export type SelfWatchlistResponse = z.infer<typeof SelfWatchlistResponseSchema>
export type SelfWatchlistSuccess = z.infer<typeof SelfWatchlistSuccessSchema>
export type SelfWatchlistError = z.infer<typeof SelfWatchlistErrorSchema>
export type WatchlistItem = z.infer<typeof WatchlistItemSchema>
export type User = z.infer<typeof UserSchema>
export type UserWatchlist = z.infer<typeof UserWatchlistSchema>
