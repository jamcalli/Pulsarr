/**
 * Client-side poster URL utilities for TMDB image optimization.
 *
 * Builds context-appropriate TMDB image URLs with optimized sizes.
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
 * Build a full TMDB poster URL from a normalized path or existing URL.
 *
 * Handles three cases:
 * 1. TMDB path (/abc.jpg) → builds full URL with context-appropriate size
 * 2. Full TMDB URL → extracts path and rebuilds with correct size
 * 3. Non-TMDB URL (Plex metadata) → returns unchanged
 *
 * @param posterPath - Normalized poster path, full URL, or null
 * @param context - Display context determining image size
 * @returns Full poster URL or null if no path provided
 *
 * @example
 * ```typescript
 * buildPosterUrl('/abc.jpg', 'card')
 * // => 'https://image.tmdb.org/t/p/w300_and_h450_face/abc.jpg'
 *
 * buildPosterUrl('https://image.tmdb.org/t/p/original/abc.jpg', 'card')
 * // => 'https://image.tmdb.org/t/p/w300_and_h450_face/abc.jpg'
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

  // If it's already a full URL, handle appropriately
  if (posterPath.startsWith('http')) {
    // Check if it's a TMDB URL - extract path and rebuild with correct size
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
