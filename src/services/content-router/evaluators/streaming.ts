import { ROUTER_FIELDS } from '@root/schemas/content-router/router-fields.js'
import { isNumber, isNumberArray } from '@utils/type-guards.js'
import { defineField } from './define-field.js'
import { compareNumberSet } from './numeric.js'

export const streamingServices = defineField(ROUTER_FIELDS.streamingServices, {
  extract: ({ watchProviders }) =>
    watchProviders
      ? (watchProviders.flatrate ?? []).map((provider) => provider.provider_id)
      : undefined,
  compare: (providers, operator, value, { log }) => {
    if (!isNumber(value) && !isNumberArray(value)) {
      log.warn(
        `Invalid streamingServices value in condition: expected number or number array, got ${typeof value}`,
      )
      return false
    }
    const providerIds = isNumber(value) ? [value] : value
    if (providerIds.length === 0) {
      log.warn(
        'Invalid streamingServices value in condition: array cannot be empty',
      )
      return false
    }
    return compareNumberSet(providers, operator, providerIds)
  },
})
