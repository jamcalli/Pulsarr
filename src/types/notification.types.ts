import type { AppriseMessageType } from '@root/types/apprise.types.js'
import type { ApprovalTrigger } from '@root/types/approval.types.js'
import type { User } from '@root/types/config.types.js'
import type {
  DirectMessage,
  DiscordWebhookPayload,
} from '@root/types/discord.types.js'

export type NotificationType =
  | 'episode'
  | 'season'
  | 'movie'
  | 'watchlist_add'
  | 'watchlist_removed'
  | 'approval_resolved'
  | 'approval_auto'
  | 'user_created'
  | 'watchlist_cap'

/** Outcome of a test send. `statusCode` is set only when an HTTP response came back. */
export interface NotificationTestResult {
  success: boolean
  statusCode?: number
  error?: string
  responseTime: number
}

export type NotificationTestOutcome = Omit<
  NotificationTestResult,
  'responseTime'
>

export const SYSTEM_TEST_TARGETS = [
  'systemApprise',
  'adminWebhook',
  'publicDiscord',
  'publicDiscordMovies',
  'publicDiscordShows',
  'publicApprise',
  'publicAppriseMovies',
  'publicAppriseShows',
] as const

export type SystemTestTarget = (typeof SYSTEM_TEST_TARGETS)[number]

export const USER_TEST_CHANNELS = [
  'apprise',
  'discord-dm',
  'plex-mobile',
] as const

export type UserTestChannel = (typeof USER_TEST_CHANNELS)[number]

export const DISCORD_BOT_STATUSES = [
  'stopped',
  'starting',
  'running',
  'stopping',
] as const

export type DiscordBotStatus = (typeof DISCORD_BOT_STATUSES)[number]

export const APPRISE_STATUSES = [
  'enabled',
  'disabled',
  'not_configured',
] as const

export type AppriseStatus = (typeof APPRISE_STATUSES)[number]

export const PLEX_MOBILE_STATUSES = [
  'enabled',
  'disabled',
  'no_plex_pass',
  'not_configured',
] as const

export type PlexMobileStatus = (typeof PLEX_MOBILE_STATUSES)[number]

export type NotificationUser = Pick<
  User,
  | 'id'
  | 'name'
  | 'alias'
  | 'apprise'
  | 'discord_id'
  | 'notify_apprise'
  | 'notify_discord'
  | 'notify_discord_mention'
  | 'notify_plex_mobile'
  | 'can_sync'
  | 'plex_uuid'
>

export interface NotificationResult {
  user: NotificationUser
  notification: MediaNotification
}

export interface MediaNotification {
  type: 'movie' | 'show'
  title: string
  username: string
  posterUrl?: string
  tmdbUrl?: string
  episodeDetails?: {
    title?: string
    overview?: string
    seasonNumber?: number
    episodeNumber?: number
    airDateUtc?: string
  }
}

export interface ApprovalNotification {
  contentTitle: string
  contentType: 'movie' | 'show'
  requestedBy: string
  trigger: ApprovalTrigger
  reason?: string | null
  totalPending: number
  posterUrl?: string
  tmdbUrl?: string
}

export interface UpdateAvailableRelease {
  currentVersion: string
  latestVersion: string
  releaseUrl: string
  releaseName: string | null
  releaseBody: string | null
  releaseBodyHtml: string | null
  publishedAt: string | null
}

export interface WatchlistCapNotification {
  userId: number
  userName: string | null
  contentType: 'movie' | 'show'
  currentCount: number
  cap: number
}

export interface AppriseMessage {
  title: string
  body: string
  bodyHtml: string
  type: AppriseMessageType
  attachment?: string
}

export interface NotificationMessage {
  webhook: DiscordWebhookPayload
  dm: DirectMessage
  apprise: AppriseMessage
}

/** `handle` is the Discord username a DM reached. */
export type DeliveryResult =
  | { ok: true; handle?: string }
  | { ok: false; reason: string }
