import { z } from 'zod'

/**
 * Converts a comma-separated string of webhook URLs into an array of trimmed, non-empty URLs.
 *
 * Returns an empty array if the input is empty or undefined.
 *
 * @param value - Comma-separated webhook URLs.
 * @returns Array of trimmed, non-empty webhook URLs.
 */
function parseWebhookUrls(value?: string): string[] {
  const trimmed = value?.trim() ?? ''
  if (trimmed.length === 0) return []

  return trimmed
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean)
}

// Discord webhook form schema
export const webhookFormSchema = z
  .object({
    discordWebhookUrl: z
      .string()
      .optional()
      .refine(
        (value): value is string => {
          // Parse URLs using the helper
          const urls = parseWebhookUrls(value)

          // Make sure we have at least one URL after filtering
          if (urls.length === 0) {
            // Empty input is valid
            return value === undefined || value.trim() === ''
          }

          // Check that all URLs are valid
          return urls.every((url) => url.includes('discord.com/api/webhooks'))
        },
        {
          message: 'All URLs must be valid Discord webhook URLs',
        },
      )
      // Add custom validation to track invalid URLs for better error messaging
      .superRefine((value, ctx) => {
        // Parse URLs using the helper
        const urls = parseWebhookUrls(value)
        if (urls.length === 0) return

        const invalidUrls = urls.filter(
          (url) => !url.includes('discord.com/api/webhooks'),
        )

        if (invalidUrls.length > 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Invalid Discord webhook URL${
              invalidUrls.length > 1 ? 's' : ''
            }: ${invalidUrls.join(', ')}`,
            path: ['discordWebhookUrl'],
          })
        }
      }),
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
