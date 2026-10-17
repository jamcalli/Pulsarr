import type { AppriseStatus } from '@root/types/notification.types'
import type { StatusPillView } from '@/components/status-pill'
import { DOCS_ROOT } from '@/lib/navigation'
import type { components } from '@/types/api.js'

export const APPRISE_DOCS_URL = `${DOCS_ROOT}/notifications/apprise`

export const APPRISE_STATUS_PILLS: Record<AppriseStatus, StatusPillView> = {
  enabled: { tone: 'on', label: 'Enabled' },
  disabled: { tone: 'failed', label: 'Disabled' },
  not_configured: { tone: 'off', label: 'Not configured' },
}

/** The status the server derives at startup, for before the progress stream reports it. */
export function appriseStatusFromConfig(
  config: Pick<components['schemas']['Config'], 'appriseUrl' | 'enableApprise'>,
): AppriseStatus {
  if (!config.appriseUrl) return 'not_configured'
  return config.enableApprise ? 'enabled' : 'disabled'
}

export function appriseLockReason(status: AppriseStatus): string | null {
  if (status === 'enabled') return null
  return status === 'disabled'
    ? 'Apprise is disabled, so these settings do nothing until it is reachable.'
    : 'Set up an Apprise server to use these settings.'
}
