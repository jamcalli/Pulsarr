import type { ActionRowBuilder, ButtonBuilder } from 'discord.js'

export const DISCORD_WEBHOOK_HOSTS = [
  'discord.com',
  'discordapp.com',
  'canary.discord.com',
  'ptb.discord.com',
] as const

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

export interface DiscordAllowedMentions {
  parse?: Array<'roles' | 'users' | 'everyone'>
  roles?: string[]
  users?: string[]
  replied_user?: boolean
}

export interface DiscordWebhookPayload {
  content?: string
  username?: string
  avatar_url?: string
  embeds?: DiscordEmbed[]
  allowed_mentions?: DiscordAllowedMentions
}

export interface DirectMessage {
  embed: DiscordEmbed
  components?: ActionRowBuilder<ButtonBuilder>[]
}
