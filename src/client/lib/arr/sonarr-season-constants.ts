// Series type constants for Sonarr UI
export const SONARR_SERIES_TYPES = ['standard', 'anime', 'daily'] as const
export type SonarrSeriesType = (typeof SONARR_SERIES_TYPES)[number]

// Display names for series types
export const SERIES_TYPE_LABELS: Record<SonarrSeriesType, string> = {
  standard: 'Standard',
  anime: 'Anime',
  daily: 'Daily',
}
