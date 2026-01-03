import type { Config, PublicContentKeyMap } from '@root/types/config.types.js'
import { isValidAppriseEndpoint } from './apprise-email.js'

/**
 * Parses a comma-separated string into a deduplicated array of valid, trimmed URLs or email addresses.
 * Uses the same validation logic as other Apprise notification paths for consistency.
 *
 * @param urlString - A comma-separated list of URLs or email addresses, or null/undefined.
 * @returns An array of unique, valid URLs/emails. Returns an empty array if {@link urlString} is null, undefined, or contains no valid entries.
 */
function parseUrls(urlString: string | undefined | null): string[] {
  if (!urlString) return []
  return Array.from(
    new Set(
      urlString
        .split(',')
        .map((url: string) => url.trim())
        .filter((url: string) => isValidAppriseEndpoint(url)),
    ),
  )
}

// Type-safe lookup table for config keys
const keyMap: PublicContentKeyMap = {
  discord: {
    generic: 'discordWebhookUrls',
    movies: 'discordWebhookUrlsMovies',
    shows: 'discordWebhookUrlsShows',
  },
  apprise: {
    generic: 'appriseUrls',
    movies: 'appriseUrlsMovies',
    shows: 'appriseUrlsShows',
  },
}

/**
 * Retrieves unique notification URLs for public content from configuration, prioritizing type-specific URLs for movies or shows and falling back to generic URLs for the specified service.
 *
 * @param notificationType - The content type ('movie' or 'show') used to select type-specific URLs.
 * @param urlType - The notification service ('discord' or 'apprise') for which URLs are retrieved.
 * @returns An array of unique, validated URLs for the specified content type and service.
 */
export function getPublicContentUrls(
  config: Config['publicContentNotifications'],
  notificationType: 'movie' | 'show',
  urlType: 'discord' | 'apprise',
): string[] {
  const keys = keyMap[urlType]

  // Try type-specific URLs first
  const typeSpecificKey =
    notificationType === 'movie' ? keys.movies : keys.shows
  const typeSpecificUrls = parseUrls(config?.[typeSpecificKey])

  if (typeSpecificUrls.length > 0) {
    return typeSpecificUrls
  }

  // Fallback to general URLs if no type-specific URLs
  return parseUrls(config?.[keys.generic])
}
