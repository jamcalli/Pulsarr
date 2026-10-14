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

export function hasBlankLimit(values: QuotaFieldValues): boolean {
  return values.on && values.quotaLimit === undefined
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
