import type { PlexMobileStatus } from '@root/types/notification.types'
import type { StatusPillView } from '@/components/status-pill'
import { DOCS_ROOT } from '@/lib/navigation'
import { UNSAVED_CHANGES_REASON } from '@/lib/settings'

export const PLEX_MOBILE_DOCS_URL = `${DOCS_ROOT}/notifications/plex-mobile#mobile-app-setup`

export const PLEX_MOBILE_STATUS_PILLS: Record<
  PlexMobileStatus,
  StatusPillView
> = {
  enabled: { tone: 'on', label: 'Enabled' },
  disabled: { tone: 'off', label: 'Disabled' },
  no_plex_pass: { tone: 'off', label: 'No Plex Pass' },
  not_configured: { tone: 'off', label: 'Not configured' },
}

export function plexMobileLockReason(status: PlexMobileStatus): string | null {
  if (status === 'no_plex_pass') {
    return 'Needs Plex Pass on the connected Plex server.'
  }
  if (status === 'not_configured') return 'Connect a Plex server first.'
  return null
}

/** Why the test push cannot send, null when it can. */
export function pushTestUnavailableReason(
  status: PlexMobileStatus | null,
  savedEnabled: boolean,
  dirty: boolean,
): string | null {
  if (status === 'disabled' || !savedEnabled) {
    return 'Save with Plex mobile turned on to send a test.'
  }
  if (dirty) return UNSAVED_CHANGES_REASON
  return null
}
