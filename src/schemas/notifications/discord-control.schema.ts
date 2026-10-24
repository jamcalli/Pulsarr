import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

export const DiscordBotResponseSchema = z
  .object({
    success: z.boolean(),
    status: z.enum(['running', 'stopped', 'starting', 'stopping', 'unknown']),
    message: z.string().optional(),
  })
  .meta({
    id: 'DiscordBotControlResponse',
    description: 'Discord bot status after a start or stop request',
  })

export const WebhookValidationRequestSchema = z
  .object({
    webhookUrls: z.string().min(1, { error: 'Webhook URLs are required' }),
  })
  .meta({
    id: 'DiscordWebhookValidationPayload',
    description: 'Comma-separated Discord webhook URLs to check',
  })

export const WebhookValidationResponseSchema = z
  .object({
    success: z.boolean(),
    valid: z.boolean(),
    urls: z.array(
      z.object({
        url: z.string(),
        valid: z.boolean(),
        error: z.string().optional(),
      }),
    ),
    duplicateCount: z.number().optional(),
    message: z.string().optional(),
  })
  .meta({
    id: 'DiscordWebhookValidationResponse',
    description: 'Whether each Discord webhook URL answered',
  })

export type DiscordBotResponse = z.infer<typeof DiscordBotResponseSchema>
export type WebhookValidationRequest = z.infer<
  typeof WebhookValidationRequestSchema
>
export type WebhookValidationResponse = z.infer<
  typeof WebhookValidationResponseSchema
>
export type DiscordControlError = z.infer<typeof ErrorSchema>

// Re-export shared schemas
export { ErrorSchema }
