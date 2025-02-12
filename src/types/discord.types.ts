export interface MediaNotification {
  username: string
  title: string
  type: 'movie' | 'show'
  posterUrl?: string
}

export interface DiscordEmbed {
  title?: string
  description?: string
  url?: string
  color?: number
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
