import { DISCORD_WEBHOOK_HOSTS } from '@root/types/discord.types.js'
import { z } from 'zod'

export function isDiscordWebhookUrl(value: string): boolean {
  if (!z.url().safeParse(value).success) return false
  const parsed = new URL(value)
  return (
    parsed.protocol === 'https:' &&
    DISCORD_WEBHOOK_HOSTS.some((host) => host === parsed.hostname) &&
    parsed.pathname.startsWith('/api/webhooks/')
  )
}

export const DiscordWebhookUrlSchema = z
  .string()
  .trim()
  .refine(isDiscordWebhookUrl, { message: 'Must be a Discord webhook URL' })
