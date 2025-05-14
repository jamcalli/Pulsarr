// Series type constants for content router UI
export const ROUTER_SERIES_TYPES = ['standard', 'anime', 'daily'] as const
export type RouterSeriesType = (typeof ROUTER_SERIES_TYPES)[number]
