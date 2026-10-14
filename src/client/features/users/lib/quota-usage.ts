import { formatQuotaUsage, quotaWindowPhrase } from '@/lib/quota'
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
  const period = quotaWindowPhrase(status.quotaType, settings)
  const text =
    status.currentUsage === 0
      ? `None used ${period}`
      : `Used ${formatQuotaUsage(status.currentUsage, status.quotaLimit)} ${period}`
  return { text, atLimit: status.exceeded }
}
