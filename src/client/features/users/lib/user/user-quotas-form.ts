import {
  type QuotaFieldValues,
  quotaPayload,
  toQuotaFieldValues,
} from '@/lib/quota-fields'
import type { components } from '@/types/api.js'

type UserQuotas = components['schemas']['UserQuotas']
type SeparateUpdate = components['schemas']['UserQuotasUpdatePayload']

export interface UserQuotasValues {
  movie: QuotaFieldValues
  show: QuotaFieldValues
}

export function toQuotaValues(quotas: UserQuotas): UserQuotasValues {
  return {
    movie: toQuotaFieldValues(quotas.movieQuota),
    show: toQuotaFieldValues(quotas.showQuota),
  }
}

export function quotaSave(values: UserQuotasValues): SeparateUpdate {
  return {
    movieQuota: quotaPayload(values.movie),
    showQuota: quotaPayload(values.show),
  }
}
