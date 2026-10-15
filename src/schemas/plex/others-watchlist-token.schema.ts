import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { PlexWatchlistSyncSchema } from '@root/schemas/plex/self-watchlist-token.schema.js'

export const othersWatchlistSchema = {
  summary: 'Get others watchlist tokens',
  operationId: 'getOthersWatchlistTokens',
  description: 'Retrieve watchlist items from other Plex users',
  tags: ['Plex'],
  response: {
    200: PlexWatchlistSyncSchema,
    400: ErrorSchema,
    500: ErrorSchema,
  },
}
