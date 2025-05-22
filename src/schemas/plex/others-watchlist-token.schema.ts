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

const OthersWatchlistSuccessSchema = z.object({
  total: z.number(),
  users: z.array(
    z.object({
      user: UserSchema,
      watchlist: z.array(WatchlistItemSchema),
    }),
  ),
})

const OthersWatchlistErrorSchema = z.object({
  error: z.string(),
})

const OthersWatchlistResponseSchema = z.union([
  OthersWatchlistSuccessSchema,
  OthersWatchlistErrorSchema,
])

export const othersWatchlistSchema = {
  summary: 'Get others watchlist tokens',
  operationId: 'getOthersWatchlistTokens',
  description: 'Retrieve watchlist items from other Plex users',
  tags: ['Plex'],
  response: {
    200: OthersWatchlistResponseSchema,
  },
}

export type OthersWatchlistResponse = z.infer<
  typeof OthersWatchlistResponseSchema
>
export type OthersWatchlistSuccess = z.infer<
  typeof OthersWatchlistSuccessSchema
>
export type OthersWatchlistError = z.infer<typeof OthersWatchlistErrorSchema>
export type WatchlistItem = z.infer<typeof WatchlistItemSchema>
export type User = z.infer<typeof UserSchema>
