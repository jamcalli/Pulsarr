import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type {
  MediaNotification,
  DiscordEmbed,
  DiscordWebhookPayload,
} from '@root/types/discord.types.js'

export class DiscordNotificationService {

  private readonly COLOR = 0x48a9a6

  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {}

  private get dbService() {
    return this.fastify.db
  }

  async sendNotification(payload: DiscordWebhookPayload): Promise<boolean> {
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
        body: JSON.stringify(payload),
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

  async sendMediaNotification(
    notification: MediaNotification,
  ): Promise<boolean> {
    const payload = this.createMediaEmbed(notification)
    return this.sendNotification(payload)
  }

  private createMediaEmbed(
    notification: MediaNotification,
  ): DiscordWebhookPayload {
    const { username, title, type, posterUrl, timestamp } = notification

    const emoji = type === 'movie' ? '🎬' : '📺'
    const mediaType = type.charAt(0).toUpperCase() + type.slice(1)

    const embed: DiscordEmbed = {
      title: `${emoji} New ${mediaType} Added`,
      description: `**${title}**`,
      color: this.COLOR,
      timestamp: new Date(timestamp).toISOString(),
      footer: {
        text: `Added by ${username}`,
      },
      fields: [
        {
          name: 'Type',
          value: mediaType,
          inline: true,
        },
        {
          name: 'Added',
                    value: new Date(timestamp).toLocaleString([], { 
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          }),
          inline: true,
        },
      ],
    }

    if (posterUrl) {
      embed.image = {
        url: posterUrl,
      }
    }

    return {
      embeds: [embed],
      username: 'Pulsarr',
      avatar_url: 'https://raw.githubusercontent.com/jamcalli/Pulsarr/master/src/client/assets/images/pulsarr.png',
    }
  }
}
