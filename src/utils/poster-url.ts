/**
 * Poster URL utilities for TMDB image optimization.
 *
 * Handles normalization of poster paths and building context-appropriate
 * TMDB image URLs with optimized sizes for different use cases.
 */

/**
 * Context for poster display, determines image size.
 */
export type PosterContext = 'card' | 'detail' | 'notification'

/**
 * TMDB image sizes optimized for each context.
 *
 * @see https://developer.themoviedb.org/docs/image-basics
 */
const POSTER_SIZES: Record<PosterContext, string> = {
  card: 'w300_and_h450_face', // Dashboard cards, carousels (~20-40KB)
  detail: 'w600_and_h900_bestv2', // Detail modals (~50-100KB)
  notification: 'w600_and_h900_bestv2', // Discord, webhooks, email (~50-100KB)
}

/**
 * Regex to extract poster path from full TMDB URLs.
 * Matches: https://image.tmdb.org/t/p/{size}/{path}
 */
const TMDB_URL_PATTERN = /^https?:\/\/image\.tmdb\.org\/t\/p\/[^/]+(\/.+)$/

/**
 * Normalize a poster URL to just the TMDB path component.
 *
 * Extracts the path from full TMDB URLs (e.g., /abc123.jpg from
 * https://image.tmdb.org/t/p/original/abc123.jpg).
 *
 * Non-TMDB URLs (e.g., Plex metadata URLs) are returned unchanged.
 *
 * @param thumb - Full poster URL or path
 * @returns Normalized path (/abc123.jpg) or original URL for non-TMDB sources
 *
 * @example
 * ```typescript
 * normalizePosterPath('https://image.tmdb.org/t/p/original/abc.jpg')
 * // => '/abc.jpg'
 *
 * normalizePosterPath('https://image.tmdb.org/t/p/w500/abc.jpg')
 * // => '/abc.jpg'
 *
 * normalizePosterPath('https://metadata-static.plex.tv/abc.jpg')
 * // => 'https://metadata-static.plex.tv/abc.jpg' (unchanged)
 *
 * normalizePosterPath('/abc.jpg')
 * // => '/abc.jpg' (already normalized)
 * ```
 */
export function normalizePosterPath(
  thumb: string | null | undefined,
): string | null {
  if (!thumb) return null

  const match = thumb.match(TMDB_URL_PATTERN)
  if (match) {
    return match[1] // Return just the path portion
  }

  // Return as-is (either already a path, or a non-TMDB URL like Plex metadata)
  return thumb
}

/**
 * Build a full TMDB poster URL from a normalized path.
 *
 * If the input is already a full URL (non-TMDB), returns it unchanged.
 * If the input is a TMDB path (/abc.jpg), builds the full URL with
 * the appropriate size for the given context.
 *
 * @param posterPath - Normalized poster path or full URL
 * @param context - Display context determining image size
 * @returns Full poster URL or null if no path provided
 *
 * @example
 * ```typescript
 * buildPosterUrl('/abc.jpg', 'card')
 * // => 'https://image.tmdb.org/t/p/w300_and_h450_face/abc.jpg'
 *
 * buildPosterUrl('/abc.jpg', 'notification')
 * // => 'https://image.tmdb.org/t/p/w600_and_h900_bestv2/abc.jpg'
 *
 * buildPosterUrl('https://metadata-static.plex.tv/abc.jpg', 'card')
 * // => 'https://metadata-static.plex.tv/abc.jpg' (unchanged)
 * ```
 */
export function buildPosterUrl(
  posterPath: string | null | undefined,
  context: PosterContext = 'card',
): string | null {
  if (!posterPath) return null

  // If it's already a full URL (non-TMDB or TMDB), handle appropriately
  if (posterPath.startsWith('http')) {
    // Check if it's a TMDB URL that wasn't normalized - extract and rebuild
    const match = posterPath.match(TMDB_URL_PATTERN)
    if (match) {
      const size = POSTER_SIZES[context]
      return `https://image.tmdb.org/t/p/${size}${match[1]}`
    }
    // Non-TMDB URL (Plex metadata, etc.) - return as-is
    return posterPath
  }

  // It's a TMDB path - build the full URL with context-appropriate size
  const size = POSTER_SIZES[context]
  return `https://image.tmdb.org/t/p/${size}${posterPath}`
}
