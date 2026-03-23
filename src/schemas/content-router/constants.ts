// Series type constants for backend
export const SERIES_TYPES = ['standard', 'anime', 'daily'] as const
export type SeriesType = (typeof SERIES_TYPES)[number]
