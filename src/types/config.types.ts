export interface User {
  id: number
  name: string
  email: string | null
  alias: string | null
  discord_id: string | null
  notify_email: boolean
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

export type DeleteSyncNotifyOption = 'none' | 'message' | 'webhook' | 'both'

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
  rateLimitMax: number
  syncIntervalSeconds: number
  queueProcessDelaySeconds: number
  // Discord Config
  discordWebhookUrl: string
  discordBotToken: string
  discordClientId: string
  discordGuildId: string
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
  // Ready state
  _isReady: boolean
}

export type RawConfig = {
  [K in keyof Config]: Config[K] extends string[] ? string : Config[K]
}
