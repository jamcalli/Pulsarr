import { z } from 'zod'

export const SONARR_SERIES_TYPES = ['standard', 'anime', 'daily'] as const

export type SonarrSeriesType = (typeof SONARR_SERIES_TYPES)[number]

export const SonarrSeriesTypeSchema = z.enum(SONARR_SERIES_TYPES).meta({
  id: 'SonarrSeriesType',
  description: 'How Sonarr numbers episodes when adding a series',
})
