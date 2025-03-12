import { z } from 'zod'

// Discord webhook form schema
export const webhookFormSchema = z
  .object({
    discordWebhookUrl: z.string().optional(),
    _connectionTested: z.boolean().optional().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.discordWebhookUrl && !data._connectionTested) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Please test connection before saving',
        path: ['discordWebhookUrl'],
      })
    }
  })

export type WebhookFormSchema = z.infer<typeof webhookFormSchema>

// Discord bot schema
export const discordBotFormSchema = z.object({
  discordBotToken: z.string().min(1, 'Bot token is required'),
  discordClientId: z.string().min(1, 'Client ID is required'),
  discordGuildId: z.string().min(1, 'Guild ID is required'),
})

export type DiscordBotFormSchema = z.infer<typeof discordBotFormSchema>

// General settings schema
export const generalFormSchema = z.object({
  queueWaitTime: z.coerce.number().int().min(0).optional(),
  newEpisodeThreshold: z.coerce.number().int().min(0).optional(),
  upgradeBufferTime: z.coerce.number().int().min(0).optional(),
})

export type GeneralFormSchema = z.infer<typeof generalFormSchema>
