import type { Config } from '@root/types/config.types.js'

/**
 * Utility functions to eliminate code duplication across notification services.
 */

/**
 * Parse comma-separated URLs with consistent trimming and filtering.
 */
function parseUrls(urlString: string): string[] {
  return urlString
    .split(',')
    .map((url: string) => url.trim())
    .filter((url: string) => url.length > 0)
}

/**
 * Parse and get public content URLs with type-specific fallbacks.
 * Eliminates duplication between Discord and Apprise services.
 */
export function getPublicContentUrls(
  config: Config['publicContentNotifications'],
  notificationType: 'movie' | 'show',
  urlType: 'discord' | 'apprise',
): string[] {
  const fieldPrefix =
    urlType === 'discord' ? 'discordWebhookUrls' : 'appriseUrls'

  let urls: string[] = []

  // Try type-specific URLs first
  const typeSpecificField =
    notificationType === 'movie'
      ? `${fieldPrefix}Movies`
      : `${fieldPrefix}Shows`

  if (config?.[typeSpecificField as keyof typeof config]) {
    urls = parseUrls(config[typeSpecificField as keyof typeof config] as string)
  }

  // Fallback to general URLs if no type-specific URLs
  if (urls.length === 0 && config?.[fieldPrefix as keyof typeof config]) {
    urls = parseUrls(config[fieldPrefix as keyof typeof config] as string)
  }

  return urls
}

/**
 * Extract Discord IDs from notification results for @ mentions.
 * Consolidates the logic that was repeated 5+ times.
 */
export function extractUserDiscordIds(
  notifications: Array<{ user: { id: number; discord_id: string | null } }>,
): string[] {
  return notifications
    .filter((r) => r.user.id !== -1 && r.user.discord_id)
    .map((r) => r.user.discord_id as string)
}
