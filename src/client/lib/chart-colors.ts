export const CHART_FILL = {
  'chart-movie': 'bg-chart-movie',
  'chart-show': 'bg-chart-show',
  'chart-season': 'bg-chart-season',
  'chart-discord': 'bg-chart-discord',
  'chart-plex-mobile': 'bg-chart-plex-mobile',
  'chart-apprise': 'bg-chart-apprise',
  'chart-native-webhook': 'bg-chart-native-webhook',
  'chart-watchlist': 'bg-chart-watchlist',
  'chart-approval': 'bg-chart-approval',
  'chart-account': 'bg-chart-account',
  'chart-requested': 'bg-chart-requested',
  'chart-grabbed': 'bg-chart-grabbed',
  'chart-notified': 'bg-chart-notified',
  'chart-single': 'bg-chart-single',
  'chart-range': 'bg-chart-range',
  'chart-error': 'bg-chart-error',
  'chart-1': 'bg-chart-1',
  'chart-2': 'bg-chart-2',
  'chart-3': 'bg-chart-3',
  'chart-4': 'bg-chart-4',
} as const satisfies Record<string, `bg-${string}`>

export type ChartColor = keyof typeof CHART_FILL
