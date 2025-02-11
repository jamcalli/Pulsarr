import type { FastifyBaseLogger } from 'fastify'
import type { FastifyInstance } from 'fastify'

interface MediaNotification {
  username: string
  title: string
  type: 'movie' | 'show'
  posterUrl?: string
  timestamp: string
}

export class DiscordNotificationService {
  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {}

  private get dbService() {
    return this.fastify.db
  }

  async sendNotification(content: string): Promise<boolean> {
    try {
      const config = await this.dbService.getConfig(1)
      
      if (!config?.discordWebhookUrl) {
        this.log.warn('Discord webhook URL not configured')
        return false
      }

      const response = await fetch(config.discordWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        this.log.error('Discord webhook request failed', {
          status: response.status,
          error: errorText,
        })
        return false
      }

      this.log.debug('Discord webhook sent successfully')
      return true
    } catch (error) {
      this.log.error('Error sending Discord webhook:', error)
      return false
    }
  }

  async sendMediaNotification(notification: MediaNotification): Promise<boolean> {
    const { username, title, type, posterUrl, timestamp } = notification
    
    const content = this.formatMediaMessage({
      username,
      title,
      type,
      posterUrl,
      timestamp,
    })

    return this.sendNotification(content)
  }

  private formatMediaMessage(notification: MediaNotification): string {
    const { username, title, type, posterUrl, timestamp } = notification
    
    const emoji = type === 'movie' ? '🎬' : '📺'
    const mediaType = type.charAt(0).toUpperCase() + type.slice(1)
    
    let message = `${emoji} **${username}** added ${mediaType}: "${title}"\n`
    message += `🕒 Added at: ${timestamp}\n`
    
    if (posterUrl) {
      message += posterUrl
    }
    
    return message
  }
}