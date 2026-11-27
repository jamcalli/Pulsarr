import {
  ConfigUpdateSchema,
  PENDING_WEBHOOK_INTERVAL_SECONDS,
  PENDING_WEBHOOK_MAX_AGE_MINUTES,
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

describe('ConfigUpdateSchema pending webhook max age', () => {
  it.each([
    PENDING_WEBHOOK_MAX_AGE_MINUTES.min - 1,
    PENDING_WEBHOOK_MAX_AGE_MINUTES.max + 1,
  ])('rejects %d minutes', (pendingWebhookMaxAge) => {
    expect(ConfigUpdateSchema.safeParse({ pendingWebhookMaxAge }).success).toBe(
      false,
    )
  })

  it.each([
    PENDING_WEBHOOK_MAX_AGE_MINUTES.min,
    PENDING_WEBHOOK_MAX_AGE_MINUTES.max,
  ])('accepts %d minutes', (pendingWebhookMaxAge) => {
    expect(ConfigUpdateSchema.safeParse({ pendingWebhookMaxAge }).success).toBe(
      true,
    )
  })
})
