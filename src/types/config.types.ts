export interface User {
  id: number
  name: string
  apprise: string | null
  alias: string | null
  discord_id: string | null
  notify_apprise: boolean
  notify_discord: boolean
  can_sync: boolean
  created_at?: string
  updated_at?: string
}

export type LogLevel =
  | 'fatal'
  | 'error'
  | 'warn'
  | 'info'
  | 'debug'
  | 'trace'
  | 'silent'

export type DeleteSyncNotifyOption =
  | 'none' // No notifications
  | 'message' // Discord DM only (legacy)
  | 'webhook' // Discord webhook only (legacy)
  | 'both' // Both Discord webhook and DM (legacy)
  | 'all' // All available notification channels
  | 'discord-only' // Only Discord (both webhook and DM if configured)
  | 'apprise-only' // Only Apprise
  | 'webhook-only' // Only Discord webhook (no DMs)
  | 'dm-only' // Only Discord DMs (no webhook)
  | 'discord-webhook' // Equivalent to webhook-only
  | 'discord-message' // Equivalent to dm-only
  | 'discord-both' // Both Discord webhook and DMs, no Apprise

export interface Config {
  // System Config
  baseUrl: string
  port: number
  dbPath: string
  cookieSecret: string
  cookieName: string
  cookieSecured: boolean
  logLevel: LogLevel
  closeGraceDelay: number
  authenticationMethod: 'required' | 'requiredExceptLocal' | 'disabled'
  rateLimitMax: number
  syncIntervalSeconds: number
  queueProcessDelaySeconds: number
  // Discord Config
  discordWebhookUrl: string
  discordBotToken: string
  discordClientId: string
  discordGuildId: string
  // Apprise Config
  enableApprise: boolean
  appriseUrl: string
  systemAppriseUrl: string
  // General Notifications
  queueWaitTime: number
  newEpisodeThreshold: number
  upgradeBufferTime: number
  // Sonarr Config
  sonarrBaseUrl: string
  sonarrApiKey: string
  sonarrQualityProfile: string
  sonarrRootFolder: string
  sonarrBypassIgnored: boolean
  sonarrSeasonMonitoring: string
  sonarrMonitorNewItems: 'all' | 'none'
  sonarrTags: string[]
  // Radarr Config
  radarrBaseUrl: string
  radarrApiKey: string
  radarrQualityProfile: string
  radarrRootFolder: string
  radarrBypassIgnored: boolean
  radarrTags: string[]
  // Plex Config
  plexTokens: string[]
  skipFriendSync: boolean
  // Delete Config
  deleteMovie: boolean
  deleteEndedShow: boolean
  deleteContinuingShow: boolean
  deleteFiles: boolean
  respectUserSyncSetting: boolean
  deleteSyncNotify: DeleteSyncNotifyOption
  maxDeletionPrevention: number
  // RSS Config
  selfRss?: string
  friendsRss?: string
  // Tagging Config
  useAliasForTags: boolean
  tagUsersInSonarr: boolean
  tagUsersInRadarr: boolean
  // Ready state
  _isReady: boolean
}

export type RawConfig = {
  [K in keyof Config]: Config[K] extends string[] ? string : Config[K]
}
