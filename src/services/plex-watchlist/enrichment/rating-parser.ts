/**
 * Rating Parser
 *
 * Parses the Rating array from Plex metadata responses into a structured format.
 * Plex returns ratings from multiple sources (IMDb, Rotten Tomatoes, TMDB) in a
 * unified Rating array.
 */

import type { ItemRatings, PlexRating } from '@root/types/plex.types.js'

/**
 * Parse the Rating array from Plex metadata into structured ItemRatings.
 *
 * Rating sources are identified by the `image` field prefix:
 * - IMDb: "imdb://image.rating"
 * - Rotten Tomatoes Critic: "rottentomatoes://image.rating.ripe" or ".rotten"
 * - Rotten Tomatoes Audience: "rottentomatoes://image.rating.upright" or ".spilled"
 * - TMDB: "themoviedb://image.rating"
 *
 * @param ratings - The Rating array from Plex metadata
 * @param imdbRatingCount - Optional IMDb vote count (from imdbRatingCount field)
 * @returns Parsed ratings object, or undefined if no ratings found
 */
export function parseRatings(
  ratings: PlexRating[] | undefined | null,
  imdbRatingCount?: number | null,
): ItemRatings | undefined {
  if (!ratings || ratings.length === 0) {
    return undefined
  }

  const result: ItemRatings = {}
  let hasAnyRating = false

  for (const rating of ratings) {
    if (!rating.image || rating.value === undefined || rating.value === null) {
      continue
    }

    const image = rating.image.toLowerCase()

    if (image.startsWith('imdb://')) {
      result.imdb = {
        rating: rating.value,
        votes: imdbRatingCount ?? null,
      }
      hasAnyRating = true
    } else if (image.startsWith('rottentomatoes://')) {
      // Rotten Tomatoes has two types: critic and audience
      // Critic: type === 'critic' (images: ripe, rotten)
      // Audience: type === 'audience' (images: upright, spilled)
      if (rating.type === 'critic') {
        result.rtCritic = rating.value
        hasAnyRating = true
      } else if (rating.type === 'audience') {
        result.rtAudience = rating.value
        hasAnyRating = true
      }
    } else if (image.startsWith('themoviedb://')) {
      result.tmdb = rating.value
      hasAnyRating = true
    }
  }

  return hasAnyRating ? result : undefined
}
