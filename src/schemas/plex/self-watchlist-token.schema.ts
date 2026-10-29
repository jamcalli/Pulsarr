import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

export const WATCHLIST_SYNC_STARTING_MESSAGE =
  'Pulsarr is still starting up. Sync again once the startup sync finishes.'

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

export const PlexWatchlistSyncSchema = z
  .object({
    total: z.number(),
    users: z.array(
      z.object({
        user: UserSchema,
        watchlist: z.array(WatchlistItemSchema),
      }),
    ),
  })
  .meta({
    id: 'PlexWatchlistSync',
    description: 'Watchlists read from Plex, with the total item count',
  })

export const selfWatchlistSchema = {
  summary: 'Sync your own watchlist',
  operationId: 'getSelfWatchlistItems',
  description:
    'Retrieve the current user watchlist items from Plex. Holds the request open for the whole sync, so use POST /v1/plex/watchlist-sync/self-watchlist/start and its status route instead.',
  deprecated: true,
  tags: ['Plex'],
  response: {
    200: PlexWatchlistSyncSchema,
    400: ErrorSchema,
    409: ErrorSchema,
    500: ErrorSchema,
  },
}
