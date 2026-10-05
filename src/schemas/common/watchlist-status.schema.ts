import { z } from 'zod'

export const WatchlistStatusSchema = z
  .enum(['pending', 'requested', 'grabbed', 'notified'])
  .meta({
    id: 'WatchlistStatus',
    description:
      'Routing state of a watchlist item or one of its instance rows: pending (not routed), requested (sent to the arr, no file), grabbed (the arr has the file), notified (in Plex and the user was told)',
  })

export type WatchlistStatus = z.infer<typeof WatchlistStatusSchema>
