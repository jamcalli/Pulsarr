import {
  CronConfigPayloadSchema,
  IntervalConfigPayloadSchema,
  IntervalConfigSchema,
} from '@root/schemas/scheduler/scheduler.schema.js'
import { Cron } from 'croner'
import { describe, expect, it } from 'vitest'

describe('IntervalConfigPayloadSchema', () => {
  it('rejects an interval longer than the scheduler can run', () => {
    expect(IntervalConfigPayloadSchema.safeParse({ days: 30 }).success).toBe(
      false,
    )
  })

  it('accepts an interval within what the scheduler can run', () => {
    expect(IntervalConfigPayloadSchema.safeParse({ days: 24 }).success).toBe(
      true,
    )
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
