import type { Config, PublicContentKeyMap } from '@root/types/config.types.js'

/**
 * Parses a comma-separated string into a deduplicated array of valid, trimmed URLs.
 *
 * @param urlString - A comma-separated list of URLs, or null/undefined.
 * @returns An array of unique, valid URLs. Returns an empty array if {@link urlString} is null, undefined, or contains no valid URLs.
 */
function parseUrls(urlString: string | undefined | null): string[] {
  if (!urlString) return []
  return Array.from(
    new Set(
      urlString
        .split(',')
        .map((url: string) => url.trim())
        .filter((url: string) => {
          if (url.length === 0) return false
          // Basic URL validation to catch obviously invalid strings
          try {
            new URL(url)
            return true
          } catch {
            return false
          }
        }),
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
