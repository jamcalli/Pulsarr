import {
  ConfigUpdateSchema,
  PENDING_WEBHOOK_INTERVAL_SECONDS,
} from '@root/schemas/config/config.schema.js'
import { describe, expect, it } from 'vitest'

const INTERVAL_FIELDS = [
  'pendingWebhookRetryInterval',
  'pendingWebhookCleanupInterval',
] as const

describe('ConfigUpdateSchema pending webhook intervals', () => {
  it.each(INTERVAL_FIELDS)('rejects %s below the minimum', (field) => {
    expect(
      ConfigUpdateSchema.safeParse({
        [field]: PENDING_WEBHOOK_INTERVAL_SECONDS.min - 1,
      }).success,
    ).toBe(false)
  })

  it.each(INTERVAL_FIELDS)('rejects %s above the maximum', (field) => {
    expect(
      ConfigUpdateSchema.safeParse({
        [field]: PENDING_WEBHOOK_INTERVAL_SECONDS.max + 1,
      }).success,
    ).toBe(false)
  })

  it.each(INTERVAL_FIELDS)('accepts %s at the bounds', (field) => {
    expect(
      ConfigUpdateSchema.safeParse({
        [field]: PENDING_WEBHOOK_INTERVAL_SECONDS.min,
      }).success,
    ).toBe(true)
    expect(
      ConfigUpdateSchema.safeParse({
        [field]: PENDING_WEBHOOK_INTERVAL_SECONDS.max,
      }).success,
    ).toBe(true)
  })
})
