import { z } from 'zod'

export const RADARR_MONITOR_OPTIONS = [
  'movieOnly',
  'movieAndCollection',
  'none',
] as const

export const RADARR_MINIMUM_AVAILABILITY_OPTIONS = [
  'announced',
  'inCinemas',
  'released',
] as const

export type RadarrMonitorType = (typeof RADARR_MONITOR_OPTIONS)[number]
export type MinimumAvailability =
  (typeof RADARR_MINIMUM_AVAILABILITY_OPTIONS)[number]

export const RadarrMonitorSchema = z.enum(RADARR_MONITOR_OPTIONS).meta({
  id: 'RadarrMonitor',
  description: 'What Radarr monitors when adding a movie',
})

export const RadarrMinimumAvailabilitySchema = z
  .enum(RADARR_MINIMUM_AVAILABILITY_OPTIONS)
  .meta({
    id: 'RadarrMinimumAvailability',
    description: 'Release stage at which Radarr considers a movie available',
  })

export const RADARR_MONITOR_LABELS: Record<RadarrMonitorType, string> = {
  movieOnly: 'Movie only',
  movieAndCollection: 'Movie and collection',
  none: 'None',
}

export const MINIMUM_AVAILABILITY_LABELS: Record<MinimumAvailability, string> =
  {
    announced: 'Announced',
    inCinemas: 'In cinemas',
    released: 'Released',
  }
