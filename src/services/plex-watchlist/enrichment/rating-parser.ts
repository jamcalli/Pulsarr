import type { ItemRatings, PlexRating } from '@root/types/plex.types.js'

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

// Plex puts imdbRatingCount on either the metadata or the container
export function imdbRatingCount(
  metadata: { imdbRatingCount?: number },
  container: { imdbRatingCount?: number } | undefined,
): number | undefined {
  return metadata.imdbRatingCount ?? container?.imdbRatingCount
}
