import { z } from 'zod'

/**
 * Converts a comma-separated string of webhook URLs into an array of trimmed, non-empty URLs.
 *
 * Returns an empty array if the input is empty or undefined.
 *
 * @param value - Comma-separated webhook URLs.
 * @returns Array of trimmed, non-empty webhook URLs.
 */
export function parseWebhookUrls(value?: string): string[] {
  const trimmed = value?.trim() ?? ''
  if (trimmed.length === 0) return []

  return trimmed
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean)
}

/**
 * Reusable Discord webhook URL validator schema with comprehensive validation:
 * - Allows empty/undefined values
 * - Validates comma-separated webhook URLs
 * - Ensures all URLs are valid Discord webhook format
 * - Provides detailed error messages for invalid URLs
 */
export const discordWebhookStringSchema = z
  .string()
  .optional()
  .refine(
    (value): value is string => {
      const urls = parseWebhookUrls(value)
      if (urls.length === 0) {
        return value === undefined || value.trim() === ''
      }
      return urls.every((url) => url.includes('discord.com/api/webhooks'))
    },
    {
      message: 'All URLs must be valid Discord webhook URLs',
    },
  )
  .superRefine((value, ctx) => {
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
      })
    }
  })
