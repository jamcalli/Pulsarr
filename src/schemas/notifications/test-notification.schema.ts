import { DiscordWebhookUrlSchema } from '@root/schemas/common/discord-webhook-url.schema.js'
import {
  SYSTEM_TEST_TARGETS,
  USER_TEST_CHANNELS,
} from '@root/types/notification.types.js'
import { z } from 'zod'

const DISCORD_ID_PATTERN = /^\d{17,20}$/

export const AppriseTestPayloadSchema = z
  .object({
    url: z
      .string()
      .trim()
      .min(1, { error: 'Apprise URL is required' })
      .meta({ description: 'Apprise URL or plain email address' }),
  })
  .meta({
    id: 'AppriseTestPayload',
    description: 'Apprise URL to send a test notification to',
  })

export const DiscordWebhookTestPayloadSchema = z
  .object({
    url: DiscordWebhookUrlSchema.meta({
      description: 'A single https://discord.com/api/webhooks/ URL',
    }),
  })
  .meta({
    id: 'DiscordWebhookTestPayload',
    description: 'Discord webhook URL to post a test message to',
  })

export const DiscordDmTestPayloadSchema = z
  .object({
    discordId: z
      .string()
      .trim()
      .regex(DISCORD_ID_PATTERN, { error: 'Must be a numeric Discord user ID' })
      .meta({ description: 'Discord user ID to message' }),
  })
  .meta({
    id: 'DiscordDmTestPayload',
    description: 'Discord user to send a test direct message to',
  })

export const SystemTestPayloadSchema = z
  .object({
    target: z
      .enum(SYSTEM_TEST_TARGETS)
      .meta({ description: 'Saved system setting to test' }),
  })
  .meta({
    id: 'SystemTestPayload',
    description: 'Saved system notification setting to test',
  })

export const UserTestParamsSchema = z.object({
  userId: z.coerce.number().int().positive(),
})

export const UserTestPayloadSchema = z
  .object({
    channel: z
      .enum(USER_TEST_CHANNELS)
      .meta({ description: 'User notification channel to test' }),
  })
  .meta({
    id: 'UserTestPayload',
    description: 'Saved user notification channel to test',
  })
