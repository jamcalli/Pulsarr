import type { RadarrMovieLookupResponse } from '@root/types/content-lookup.types.js'
import { pickReleaseDates } from '@services/tmdb/release-dates.js'
import { describe, expect, it } from 'vitest'

function lookup(
  dates: Partial<RadarrMovieLookupResponse>,
): RadarrMovieLookupResponse {
  return { id: 1, title: 'Movie', year: 2024, tmdbId: 1, ...dates }
}

describe('pickReleaseDates', () => {
  it('maps every Radarr release date', () => {
    expect(
      pickReleaseDates(
        lookup({
          inCinemas: '2024-03-01T00:00:00Z',
          digitalRelease: '2024-05-10T00:00:00Z',
          physicalRelease: '2024-07-01T00:00:00Z',
        }),
      ),
    ).toEqual({
      theatrical: '2024-03-01',
      digital: '2024-05-10',
      physical: '2024-07-01',
    })
  })

  it('keeps only the dates Radarr reports', () => {
    expect(
      pickReleaseDates(lookup({ digitalRelease: '2024-05-10T00:00:00Z' })),
    ).toEqual({ digital: '2024-05-10' })
  })

  it('returns undefined when Radarr reports no dates', () => {
    expect(pickReleaseDates(lookup({}))).toBeUndefined()
  })

  it('treats an empty date as absent', () => {
    expect(
      pickReleaseDates(
        lookup({ inCinemas: '', digitalRelease: '2024-05-10T00:00:00Z' }),
      ),
    ).toEqual({ digital: '2024-05-10' })
  })

  it('returns undefined without a lookup', () => {
    expect(pickReleaseDates(null)).toBeUndefined()
  })

  it('trims the datetime to a calendar day', () => {
    expect(
      pickReleaseDates(lookup({ physicalRelease: '2024-03-01T12:34:56Z' }))
        ?.physical,
    ).toBe('2024-03-01')
  })
})
