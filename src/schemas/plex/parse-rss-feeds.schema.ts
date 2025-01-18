import { z } from 'zod'

const WatchlistItemSchema = z.object({
  title: z.string(),
  plexKey: z.string(),
  type: z.string(),
  thumb: z.string(),
  guids: z.array(z.string()),
  genres: z.array(z.string()),
  status: z.literal('pending'),
})

const UserSchema = z.object({
  watchlistId: z.string(),
  username: z.string(),
  userId: z.number(),
})

const WatchlistSectionSchema = z.object({
  total: z.number(),
  users: z.array(
    z.object({
      user: UserSchema,
      watchlist: z.array(WatchlistItemSchema),
    }),
  ),
})

const RssWatchlistSuccessSchema = z.object({
  self: WatchlistSectionSchema,
  friends: WatchlistSectionSchema,
})

const RssWatchlistErrorSchema = z.object({
  error: z.string(),
})

const RssWatchlistResponseSchema = z.union([
  RssWatchlistSuccessSchema,
  RssWatchlistErrorSchema,
])

export const rssWatchlistSchema = {
  tags: ['Plex'],
  response: {
    200: RssWatchlistResponseSchema,
  },
}

export type RssWatchlistResponse = z.infer<typeof RssWatchlistResponseSchema>
export type RssWatchlistSuccess = z.infer<typeof RssWatchlistSuccessSchema>
export type RssWatchlistError = z.infer<typeof RssWatchlistErrorSchema>
export type WatchlistItem = z.infer<typeof WatchlistItemSchema>
export type User = z.infer<typeof UserSchema>
