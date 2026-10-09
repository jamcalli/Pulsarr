import type { MediaNotification } from '@root/types/discord.types.js'

export type HeldNotificationReason = 'digest' | 'quiet_hours'

export interface HeldEpisode {
  seasonNumber: number
  episodeNumber: number
}

/** A media-available user notification waiting for its delivery time. */
export interface HeldNotification {
  id: number
  user_id: number
  media_type: 'movie' | 'show'
  guid: string
  title: string
  watchlist_item_key: string | null
  is_bulk_release: boolean
  episodes: HeldEpisode[]
  notification: MediaNotification
  reason: HeldNotificationReason
  deliver_after: Date
  claimed_at: Date | null
  created_at: Date
}

export type HeldNotificationCreate = Omit<
  HeldNotification,
  'id' | 'claimed_at' | 'created_at'
>
