import type { QuotaType } from '@root/schemas/shared/quota-type.schema.js'
import { z } from 'zod'

export const QUOTA_REQUEST_LIMIT = { min: 1, max: 1000 } as const
export const WATCHLIST_CAP_ITEMS = { min: 1, max: 10000 } as const
export const WATCHLIST_CAP_SUGGESTED = 100

export const QUOTA_DEFAULTS: {
  readonly quotaType: QuotaType
  readonly limit: number
} = {
  quotaType: 'monthly',
  limit: 10,
}

export const QuotaLimitSchema = z
  .number({ error: 'Enter a number of requests.' })
  .int()
  .min(QUOTA_REQUEST_LIMIT.min)
  .max(QUOTA_REQUEST_LIMIT.max)

export const WatchlistCapSchema = z
  .number({ error: 'Enter a number of items.' })
  .int()
  .min(WATCHLIST_CAP_ITEMS.min)
  .max(WATCHLIST_CAP_ITEMS.max)
