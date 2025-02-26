// File: src/schemas/notifications/discord-control.schema.ts
import { z } from 'zod'

// Schema for Discord bot status responses
export const DiscordBotResponseSchema = z.object({
  success: z.boolean(),
  status: z.enum(['running', 'stopped', 'starting', 'stopping', 'unknown']),
  message: z.string().optional(),
})

// Common error schema
export const ErrorSchema = z.object({
  message: z.string(),
})

// Type exports
export type DiscordBotResponse = z.infer<typeof DiscordBotResponseSchema>
export type Error = z.infer<typeof ErrorSchema>
