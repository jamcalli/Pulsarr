import { z } from 'zod'

// Discord webhook form schema
export const webhookFormSchema = z.object({
  discordWebhookUrl: z.string().optional(),
})

export type WebhookFormSchema = z.infer<typeof webhookFormSchema>

// Discord bot schema
export const discordBotFormSchema = z.object({
  discordBotToken: z.string().optional(),
  discordClientId: z.string().optional(),
  discordGuildId: z.string().optional(),
})

export type DiscordBotFormSchema = z.infer<typeof discordBotFormSchema>

// General settings schema
export const generalFormSchema = z.object({
  queueWaitTime: z.coerce.number().int().min(0).optional(),
  newEpisodeThreshold: z.coerce.number().int().min(0).optional(),
  upgradeBufferTime: z.coerce.number().int().min(0).optional(),
})

export type GeneralFormSchema = z.infer<typeof generalFormSchema>
