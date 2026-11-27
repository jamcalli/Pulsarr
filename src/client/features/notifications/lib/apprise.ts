import type { AppriseStatus } from '@root/types/notification.types'
import type { StatusPillView } from '@/components/status-pill'
import { DOCS_ROOT } from '@/lib/navigation'
import type { components } from '@/types/api.js'

export const APPRISE_DOCS_URL = `${DOCS_ROOT}/notifications/apprise`
export const APPRISE_URL_FORMATS_URL = 'https://appriseit.com/'

export const APPRISE_STATUS_PILLS: Record<AppriseStatus, StatusPillView> = {
  enabled: { tone: 'on', label: 'Enabled' },
  unreachable: { tone: 'failed', label: 'Unreachable' },
  not_configured: { tone: 'off', label: 'Not configured' },
}

/** The status the saved config implies, for before the progress stream reports it. */
export function appriseStatusFromConfig(
  config: Pick<components['schemas']['Config'], 'appriseUrl' | 'enableApprise'>,
): AppriseStatus {
  if (!config.appriseUrl) return 'not_configured'
  return config.enableApprise ? 'enabled' : 'unreachable'
}

export function appriseLockReason(
  status: AppriseStatus,
  covers: 'settings' | 'lists' = 'settings',
): string | null {
  if (status === 'enabled') return null
  return status === 'unreachable'
    ? `Apprise is unreachable, so these ${covers} do nothing until the server answers.`
    : `Set up an Apprise server to use these ${covers}.`
}
