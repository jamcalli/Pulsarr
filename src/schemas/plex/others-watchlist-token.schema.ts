import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { PlexWatchlistSyncSchema } from '@root/schemas/plex/self-watchlist-token.schema.js'

export const othersWatchlistSchema = {
  summary: 'Get others watchlist tokens',
  operationId: 'getOthersWatchlistTokens',
  description:
    'Retrieve watchlist items from other Plex users. Holds the request open for the whole sync, so use POST /v1/plex/watchlist-sync/others-watchlist/start and its status route instead.',
  deprecated: true,
  tags: ['Plex'],
  response: {
    200: PlexWatchlistSyncSchema,
    400: ErrorSchema,
    409: ErrorSchema,
    500: ErrorSchema,
  },
}
