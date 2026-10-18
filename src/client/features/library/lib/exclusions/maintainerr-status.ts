import { MAINTAINERR_MIN_VERSION } from '@root/schemas/notifications/maintainerr-webhook.schema'
import type { StatusPillView } from '@/components/status-pill'
import { formatNumber } from '@/lib/format'
import { UNSAVED_CHANGES_REASON } from '@/lib/settings'
import type { components } from '@/types/api.js'

type Config = components['schemas']['Config']
type MaintainerrStatus = components['schemas']['MaintainerrStatus']

/** A null result while enabled means the first reconcile after boot has not finished. */
export function maintainerrPill(
  enabled: boolean,
  result: MaintainerrStatus | null,
): StatusPillView {
  if (!enabled) return { tone: 'off', label: 'Disabled' }
  if (result === null) return { tone: 'pending', label: 'Checking' }
  switch (result.status) {
    case 'ok':
      return result.error
        ? { tone: 'warning', label: 'Test failed' }
        : { tone: 'on', label: 'Connected' }
    case 'error':
      return { tone: 'failed', label: 'Error' }
    case 'unsupported_version':
      return { tone: 'failed', label: 'Unsupported version' }
    case 'disabled':
      return { tone: 'off', label: 'Disabled' }
  }
}

export function unsupportedVersionLine(version: string | undefined): string {
  const which = version ? `Maintainerr ${version}` : 'This Maintainerr'
  return `${which} is too old. Upgrade to ${MAINTAINERR_MIN_VERSION} or later.`
}

/** The facts a reconcile reported, empty when it reported none. */
export function maintainerrFacts(
  result: MaintainerrStatus,
): Array<{ label: string; value: string }> {
  const facts: Array<{ label: string; value: string }> = []
  if (result.version) facts.push({ label: 'Version', value: result.version })
  if (result.connectedGroups !== undefined) {
    facts.push({
      label: 'Connected rule groups',
      value: formatNumber(result.connectedGroups),
    })
  }
  if (result.testDelivered !== undefined) {
    facts.push({
      label: 'Test delivery',
      value: result.testDelivered ? 'Delivered' : 'Not delivered',
    })
  }
  return facts
}

/** Null when Sync now can run. */
export function syncUnavailableReason(
  dirty: boolean,
  config: Pick<Config, 'maintainerrEnabled' | 'maintainerrUrl'>,
): string | null {
  if (dirty) return UNSAVED_CHANGES_REASON
  if (!config.maintainerrEnabled) return 'Turn on Maintainerr and save first.'
  if (!config.maintainerrUrl) return 'Save the Maintainerr URL first.'
  return null
}
