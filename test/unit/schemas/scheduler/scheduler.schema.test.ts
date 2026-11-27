import {
  CronConfigPayloadSchema,
  IntervalConfigPayloadSchema,
  IntervalConfigSchema,
  MAX_INTERVAL_DAYS,
} from '@root/schemas/scheduler/scheduler.schema.js'
import { Cron } from 'croner'
import { describe, expect, it } from 'vitest'

describe('IntervalConfigPayloadSchema', () => {
  it.each([
    { days: MAX_INTERVAL_DAYS },
    { hours: MAX_INTERVAL_DAYS * 24 },
    { minutes: MAX_INTERVAL_DAYS * 24 * 60 },
    { seconds: MAX_INTERVAL_DAYS * 24 * 60 * 60 },
    { days: 6, hours: 24 },
  ])('accepts %o, which is the longest interval allowed', (interval) => {
    expect(IntervalConfigPayloadSchema.safeParse(interval).success).toBe(true)
  })

  it.each([
    { days: MAX_INTERVAL_DAYS + 1 },
    { hours: MAX_INTERVAL_DAYS * 24 + 1 },
    { days: MAX_INTERVAL_DAYS, seconds: 1 },
    { days: 30 },
  ])('rejects %o, which is longer than the limit', (interval) => {
    expect(IntervalConfigPayloadSchema.safeParse(interval).success).toBe(false)
  })
})

describe('IntervalConfigSchema', () => {
  it('reads back a stored interval longer than the request cap', () => {
    expect(IntervalConfigSchema.safeParse({ days: 30 }).success).toBe(true)
  })
})

describe('CronConfigPayloadSchema', () => {
  it.each([
    '0 3 * * 0',
    '0 */4 * * *',
    '0 2 * * *',
    '0 2 * * 0',
    '0 * * * *',
    '0 0 2 * * *',
    '0 0 1 * * 0',
    '30 2 * * *',
  ])('accepts %s and finds a future run', (expression) => {
    expect(CronConfigPayloadSchema.safeParse({ expression }).success).toBe(true)
    expect(new Cron(expression).nextRun()?.getTime()).toBeGreaterThan(
      Date.now(),
    )
  })

  it.each(['2000-01-01T00:00:00Z', '2099-01-01T00:00:00Z'])(
    'rejects the date %s, which is not a cron expression',
    (expression) => {
      expect(CronConfigPayloadSchema.safeParse({ expression }).success).toBe(
        false,
      )
    },
  )

  it('rejects a malformed expression', () => {
    expect(
      CronConfigPayloadSchema.safeParse({ expression: '0 2 *' }).success,
    ).toBe(false)
  })
})
