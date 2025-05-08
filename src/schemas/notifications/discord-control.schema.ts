// File: src/schemas/notifications/discord-control.schema.ts
import { z } from 'zod'

// Schema for Discord bot status responses
export const DiscordBotResponseSchema = z.object({
  success: z.boolean(),
  status: z.enum(['running', 'stopped', 'starting', 'stopping', 'unknown']),
  message: z.string().optional(),
})

// Schema for webhook validation requests
export const WebhookValidationRequestSchema = z.object({
  webhookUrls: z.string().min(1, 'Webhook URLs are required'),
})

// Schema for webhook validation responses
export const WebhookValidationResponseSchema = z.object({
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

// Common error schema
export const ErrorSchema = z.object({
  message: z.string(),
})

// Type exports
export type DiscordBotResponse = z.infer<typeof DiscordBotResponseSchema>
export type WebhookValidationRequest = z.infer<
  typeof WebhookValidationRequestSchema
>
export type WebhookValidationResponse = z.infer<
  typeof WebhookValidationResponseSchema
>
export type Error = z.infer<typeof ErrorSchema>
