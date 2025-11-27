import { DISCORD_WEBHOOK_HOSTS } from '@root/types/discord.types'
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
 * Checks if a URL is a valid Discord webhook URL.
 * Uses the shared DISCORD_WEBHOOK_HOSTS constant and URL parsing to ensure
 * consistency with server-side validation in discord-notifications.service.ts.
 */
function isValidDiscordWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (
      parsed.protocol === 'https:' &&
      DISCORD_WEBHOOK_HOSTS.some((host) => host === parsed.hostname) &&
      parsed.pathname.startsWith('/api/webhooks/')
    )
  } catch {
    return false
  }
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
  .superRefine((value, ctx) => {
    const urls = parseWebhookUrls(value)
    if (urls.length === 0) {
      if (value !== undefined && value.trim() !== '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'All URLs must be valid Discord webhook URLs',
        })
      }
      return
    }

    const invalidUrls = urls.filter((url) => !isValidDiscordWebhookUrl(url))

    if (invalidUrls.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid Discord webhook URL${
          invalidUrls.length > 1 ? 's' : ''
        }: ${invalidUrls.join(', ')}`,
      })
    }
  })
