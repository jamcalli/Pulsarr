import {
  QUOTA_DEFAULTS,
  WATCHLIST_CAP_SUGGESTED,
} from '@root/schemas/shared/quota-limits'
import type { components } from '@/types/api.js'

type QuotaType = components['schemas']['QuotaType']
type UserQuota = components['schemas']['UserQuota']
type QuotaPayload = components['schemas']['UserQuotaPayload']

export interface QuotaFieldValues {
  on: boolean
  quotaType: QuotaType
  quotaLimit?: number
  bypassApproval: boolean
  capOn: boolean
  cap?: number
}

export const QUOTA_FIELD_DEFAULTS: QuotaFieldValues = {
  on: false,
  quotaType: QUOTA_DEFAULTS.quotaType,
  quotaLimit: QUOTA_DEFAULTS.limit,
  bypassApproval: false,
  capOn: false,
  cap: WATCHLIST_CAP_SUGGESTED,
}

export function toQuotaFieldValues(
  quota: UserQuota | undefined,
): QuotaFieldValues {
  if (!quota) return QUOTA_FIELD_DEFAULTS
  return {
    on: true,
    quotaType: quota.quotaType,
    quotaLimit: quota.quotaLimit,
    bypassApproval: quota.bypassApproval,
    capOn: quota.watchlistCap !== null,
    cap: quota.watchlistCap ?? WATCHLIST_CAP_SUGGESTED,
  }
}

/** Null when the cap is off or blank. */
export function capPayload({ capOn, cap }: QuotaFieldValues): number | null {
  return capOn && cap !== undefined ? cap : null
}

export const QUOTA_REMOVAL_DESCRIPTION =
  'Their movie and show quotas and watchlist caps are deleted.'

export type BlankQuotaField = 'limit' | 'cap'

export const BLANK_QUOTA_MESSAGES: Record<BlankQuotaField, string> = {
  limit: 'Set a limit to save',
  cap: 'Set a cap to save',
}

function blankField(values: QuotaFieldValues): BlankQuotaField | null {
  if (!values.on) return null
  if (values.quotaLimit === undefined) return 'limit'
  if (values.capOn && values.cap === undefined && !values.bypassApproval) {
    return 'cap'
  }
  return null
}

/** The blank field that blocks saving these types, a limit before a cap, or null when they can save. */
export function blankQuotaField(
  types: readonly QuotaFieldValues[],
): BlankQuotaField | null {
  const blanks = types.map(blankField)
  if (blanks.includes('limit')) return 'limit'
  if (blanks.includes('cap')) return 'cap'
  return null
}

/** A switched off type sends `enabled: false`, which deletes that quota. */
export function quotaPayload(values: QuotaFieldValues): QuotaPayload {
  if (!values.on) return { enabled: false }
  return {
    enabled: true,
    quotaType: values.quotaType,
    quotaLimit: values.quotaLimit,
    bypassApproval: values.bypassApproval,
    watchlistCap: capPayload(values),
  }
}
