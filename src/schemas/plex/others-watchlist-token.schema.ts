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

const OthersWatchlistSuccessSchema = z.object({
  total: z.number(),
  users: z.array(
    z.object({
      user: UserSchema,
      watchlist: z.array(WatchlistItemSchema),
    }),
  ),
})

export const othersWatchlistSchema = {
  summary: 'Get others watchlist tokens',
  operationId: 'getOthersWatchlistTokens',
  description: 'Retrieve watchlist items from other Plex users',
  tags: ['Plex'],
  response: {
    200: OthersWatchlistSuccessSchema,
    400: ErrorSchema,
    500: ErrorSchema,
  },
}

export type OthersWatchlistSuccess = z.infer<
  typeof OthersWatchlistSuccessSchema
>
export type WatchlistItem = z.infer<typeof WatchlistItemSchema>
export type User = z.infer<typeof UserSchema>

// Re-export ErrorSchema for domain-specific error type
export { ErrorSchema as OthersWatchlistErrorSchema }
export type OthersWatchlistError = z.infer<typeof ErrorSchema>
