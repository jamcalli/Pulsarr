/**
 * Valid hostnames for Discord webhook URLs.
 * Discord uses both discord.com and the legacy discordapp.com domain.
 */
export const DISCORD_WEBHOOK_HOSTS = ['discord.com', 'discordapp.com'] as const

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

export interface DiscordEmbed {
  title?: string
  description?: string
  url?: string
  color?: number
  timestamp?: string
  footer?: {
    text: string
    icon_url?: string
  }
  thumbnail?: {
    url: string
  }
  image?: {
    url: string
  }
  author?: {
    name: string
    icon_url?: string
  }
  fields?: Array<{
    name: string
    value: string
    inline?: boolean
  }>
}

export interface DiscordWebhookPayload {
  content?: string
  username?: string
  avatar_url?: string
  embeds?: DiscordEmbed[]
}

export interface SystemNotification {
  type: 'system'
  username: string
  title: string
  embedFields: Array<{ name: string; value: string; inline?: boolean }>
  safetyTriggered?: boolean
  posterUrl?: string
  tmdbUrl?: string
  actionButton?: {
    label: string
    customId: string
    style: 'Primary' | 'Secondary' | 'Success' | 'Danger'
  }
}
