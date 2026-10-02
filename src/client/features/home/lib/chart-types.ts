export const CHARTS = {
  STATUS_TRANSITIONS: 'status_transitions',
  NOTIFICATIONS: 'notifications',
  CONTENT_DISTRIBUTION: 'content_distribution',
  TOP_GENRES: 'top_genres',
} as const

export type ChartType = (typeof CHARTS)[keyof typeof CHARTS]

export interface ChartConfigItem {
  label: string
  description: string
}

export const CHART_CONFIG: Record<ChartType, ChartConfigItem> = {
  [CHARTS.STATUS_TRANSITIONS]: {
    label: 'Grabbed to Notify',
    description:
      'Time taken from content being grabbed to notification (in minutes)',
  },
  [CHARTS.NOTIFICATIONS]: {
    label: 'Notifications',
    description: 'Notification distribution by channel and type',
  },
  [CHARTS.CONTENT_DISTRIBUTION]: {
    label: 'Content Distribution',
    description: 'Distribution of content types',
  },
  [CHARTS.TOP_GENRES]: {
    label: 'Top Genres',
    description: 'Most popular content genres',
  },
}
