import { BackgroundRunStatusSchema } from '@root/schemas/common/background-run.schema.js'
import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { MessageResponseSchema } from '@root/schemas/common/message.schema.js'
import { z } from 'zod'

const WatchlistSyncParamsSchema = z.object({
  type: z.enum(['self-watchlist', 'others-watchlist']).meta({
    id: 'WatchlistSyncType',
    description: 'Your own watchlist or the watchlists of your Plex friends',
  }),
})

export const WatchlistSyncStatusSchema = BackgroundRunStatusSchema.extend({
  total: z.number().int().nullable().meta({
    description: 'Items read by the latest finished sync',
  }),
  friends: z.number().int().nullable().meta({
    description:
      'Friends read by the latest finished sync, always null for your own watchlist',
  }),
}).meta({
  id: 'WatchlistSyncStatus',
  description: 'The latest sync of one watchlist type',
})

export const startWatchlistSyncSchema = {
  summary: 'Start a watchlist sync',
  operationId: 'startWatchlistSync',
  description:
    'Starts a sync of one watchlist type in the background and returns at once, joining or queueing behind a sync already running. Read the status route for the outcome.',
  tags: ['Plex'],
  params: WatchlistSyncParamsSchema,
  response: {
    202: MessageResponseSchema,
    409: ErrorSchema,
    500: ErrorSchema,
  },
}

export const watchlistSyncStatusSchema = {
  summary: 'Get watchlist sync status',
  operationId: 'getWatchlistSyncStatus',
  description:
    'Whether a sync of one watchlist type is running and how the latest one ended. Resets when the server restarts.',
  tags: ['Plex'],
  params: WatchlistSyncParamsSchema,
  response: {
    200: WatchlistSyncStatusSchema,
    500: ErrorSchema,
  },
}
