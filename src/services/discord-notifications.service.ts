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

  private get config() {
    return this.fastify.config
  }

  async sendNotification(payload: DiscordWebhookPayload): Promise<boolean> {
    if (!this.config.discordWebhookUrl) {
      return false
    }

    try {
      const response = await fetch(this.config.discordWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        this.log.error('Discord webhook request failed', {
          status: response.status,
        })
        return false
      }

      this.log.info('Discord webhook sent successfully')
      return true
    } catch (error) {
      this.log.error('Error sending Discord webhook:', error)
      return false
    }
  }

  async sendMediaNotification(notification: MediaNotification): Promise<boolean> {
    const payload = this.createMediaEmbed(notification)
    return this.sendNotification(payload)
  }

  private createMediaEmbed(notification: MediaNotification): DiscordWebhookPayload {
    const emoji = notification.type === 'movie' ? '🎬' : '📺'
    const mediaType = notification.type.charAt(0).toUpperCase() + notification.type.slice(1)

    const embed: DiscordEmbed = {
      title: notification.title,
      description: `${emoji} New ${mediaType} Added`,
      color: this.COLOR,
      footer: {
        text: `Added by ${notification.username}`,
      },
      fields: [
        {
          name: 'Type',
          value: mediaType,
          inline: true,
        }
      ],
    }

    if (notification.posterUrl) {
      embed.image = {
        url: notification.posterUrl,
      }
    }

    return {
      embeds: [embed],
      username: 'Pulsarr',
      avatar_url: 'https://raw.githubusercontent.com/jamcalli/Pulsarr/master/src/client/assets/images/pulsarr.png',
    }
  }
}