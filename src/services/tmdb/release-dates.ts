import type { RadarrMovieLookupResponse } from '@root/types/content-lookup.types.js'
import type { MovieReleaseDates } from '@schemas/tmdb/tmdb.schema.js'

export function pickReleaseDates(
  lookup: RadarrMovieLookupResponse | null | undefined,
): MovieReleaseDates | undefined {
  const theatrical = day(lookup?.inCinemas)
  const digital = day(lookup?.digitalRelease)
  const physical = day(lookup?.physicalRelease)
  if (!theatrical && !digital && !physical) return undefined
  return { theatrical, digital, physical }
}

function day(value: string | undefined): string | undefined {
  return value ? value.slice(0, 10) : undefined
}
