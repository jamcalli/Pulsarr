import { useSystemStatus } from '@/hooks/useSystemStatus'

type PlexMobileStatus =
  | 'enabled'
  | 'disabled'
  | 'no_plex_pass'
  | 'not_configured'
  | 'unknown'

const KNOWN_STATUSES: readonly string[] = [
  'enabled',
  'disabled',
  'no_plex_pass',
  'not_configured',
]

export function usePlexMobileStatus(): PlexMobileStatus {
  const status = useSystemStatus('plex-mobile-status')
  return KNOWN_STATUSES.includes(status)
    ? (status as PlexMobileStatus)
    : 'unknown'
}
