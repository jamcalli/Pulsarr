import type { RadarrMovieLookupResponse } from '@root/types/content-lookup.types.js'
import type { MovieReleaseDates } from '@schemas/tmdb/tmdb.schema.js'

export function pickReleaseDates(
  lookup: RadarrMovieLookupResponse | null | undefined,
): MovieReleaseDates | undefined {
  const theatrical = lookup?.inCinemas?.slice(0, 10)
  const digital = lookup?.digitalRelease?.slice(0, 10)
  const physical = lookup?.physicalRelease?.slice(0, 10)
  if (!theatrical && !digital && !physical) return undefined
  return { theatrical, digital, physical }
}
