import { isValidAppriseEndpoint } from '@root/schemas/common/apprise-endpoint'
import { isDiscordWebhookUrl } from '@root/schemas/common/discord-webhook-url.schema'
import { splitUrlList } from '@root/schemas/common/url-list'

export function discordWebhookRowError(url: string): string | null {
  return isDiscordWebhookUrl(url)
    ? null
    : 'Enter a Discord webhook URL starting https://discord.com/api/webhooks/.'
}

export function appriseRowError(url: string): string | null {
  return isValidAppriseEndpoint(url)
    ? null
    : 'Enter an Apprise URL with :// or an email address.'
}

/** The first row error in a saved-format list, the sentence the save bar shows. */
export function firstRowError(
  value: string,
  validateRow: (url: string) => string | null,
): string | null {
  for (const url of splitUrlList(value)) {
    const error = validateRow(url)
    if (error) return error
  }
  return null
}
