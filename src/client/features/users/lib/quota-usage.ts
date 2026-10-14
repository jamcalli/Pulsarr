import { formatNumber } from '@/lib/format'
import { quotaWindowPhrase } from '@/lib/quota'
import type { components } from '@/types/api.js'

type QuotaStatus = components['schemas']['UserQuotaStatus']
type QuotaSettings = components['schemas']['QuotaSettings']

export interface QuotaUsage {
  text: string
  atLimit: boolean
}

/** Null when the type has no quota. */
export function quotaUsage(
  status: QuotaStatus | null,
  settings: QuotaSettings | null,
): QuotaUsage | null {
  if (!status) return null
  const text =
    status.currentUsage === 0
      ? 'Not used yet'
      : `Used ${formatNumber(status.currentUsage)} of ${formatNumber(status.quotaLimit)} ${quotaWindowPhrase(status.quotaType, settings)}`
  return { text, atLimit: status.exceeded }
}
