import {
  DEFAULT_NOTIFICATION_DELIVERY,
  type NotificationDeliveryDefaults,
} from '@root/schemas/notifications/delivery-schedule.schema.js'
import {
  computeDeliveryDecision,
  type EffectiveDeliverySchedule,
  resolveDeliverySchedule,
} from '@services/notifications/delivery-schedule/schedule.js'
import { describe, expect, it } from 'vitest'

const at = (iso: string) => Date.parse(iso)
const iso = (instant: number) => new Date(instant).toISOString()

function schedule(
  overrides: Partial<EffectiveDeliverySchedule> = {},
): EffectiveDeliverySchedule {
  return {
    digestMode: 'off',
    digestWindowMinutes: 15,
    digestTime: '09:00',
    quietHours: null,
    timeZone: 'UTC',
    ...overrides,
  }
}

describe('resolveDeliverySchedule', () => {
  const admin: NotificationDeliveryDefaults = {
    ...DEFAULT_NOTIFICATION_DELIVERY,
    digestMode: 'window',
    digestWindowMinutes: 30,
    quietHoursEnabled: true,
    quietHoursStart: '23:00',
    quietHoursEnd: '06:00',
    timezone: 'Europe/London',
  }

  it('defaults to immediate delivery when nothing is configured', () => {
    expect(resolveDeliverySchedule({}, undefined, 'UTC')).toEqual({
      digestMode: 'off',
      digestWindowMinutes: 15,
      digestTime: '09:00',
      quietHours: null,
      timeZone: 'UTC',
    })
  })

  it('inherits every admin default when the user has no overrides', () => {
    expect(resolveDeliverySchedule({}, admin, 'UTC')).toEqual({
      digestMode: 'window',
      digestWindowMinutes: 30,
      digestTime: '09:00',
      quietHours: { start: '23:00', end: '06:00' },
      timeZone: 'Europe/London',
    })
  })

  it('treats null user fields as inherit', () => {
    const resolved = resolveDeliverySchedule(
      {
        notify_digest_mode: null,
        notify_quiet_hours_enabled: null,
        notify_timezone: null,
      },
      admin,
      'UTC',
    )
    expect(resolved.digestMode).toBe('window')
    expect(resolved.quietHours).toEqual({ start: '23:00', end: '06:00' })
    expect(resolved.timeZone).toBe('Europe/London')
  })

  it('lets a user opt out of admin defaults', () => {
    const resolved = resolveDeliverySchedule(
      { notify_digest_mode: 'off', notify_quiet_hours_enabled: false },
      admin,
      'UTC',
    )
    expect(resolved.digestMode).toBe('off')
    expect(resolved.quietHours).toBeNull()
  })

  it('applies each override independently', () => {
    const resolved = resolveDeliverySchedule(
      {
        notify_digest_mode: 'daily',
        notify_digest_time: '18:30',
        notify_quiet_hours_enabled: true,
        notify_quiet_hours_end: '09:00',
        notify_timezone: 'Asia/Tokyo',
      },
      admin,
      'UTC',
    )
    expect(resolved).toEqual({
      digestMode: 'daily',
      digestWindowMinutes: 30,
      digestTime: '18:30',
      quietHours: { start: '23:00', end: '09:00' },
      timeZone: 'Asia/Tokyo',
    })
  })

  it('falls back through invalid zones to the server zone', () => {
    const resolved = resolveDeliverySchedule(
      { notify_timezone: 'Mars/Olympus' },
      { ...admin, timezone: '' },
      'America/Chicago',
    )
    expect(resolved.timeZone).toBe('America/Chicago')
  })
})

describe('computeDeliveryDecision', () => {
  it('delivers immediately when both features are off', () => {
    expect(computeDeliveryDecision(Date.now(), schedule())).toBeNull()
  })

  it('holds for the digest window', () => {
    const decision = computeDeliveryDecision(
      at('2026-05-01T12:00:00Z'),
      schedule({ digestMode: 'window', digestWindowMinutes: 15 }),
    )
    expect(decision).toEqual({
      deliverAfter: at('2026-05-01T12:15:00Z'),
      reason: 'digest',
    })
  })

  it('holds until the next daily digest time', () => {
    const decision = computeDeliveryDecision(
      at('2026-05-01T12:00:00Z'),
      schedule({ digestMode: 'daily', digestTime: '09:00' }),
    )
    expect(decision && iso(decision.deliverAfter)).toBe(
      '2026-05-02T09:00:00.000Z',
    )
  })

  it('delivers immediately outside quiet hours with no digest', () => {
    expect(
      computeDeliveryDecision(
        at('2026-05-01T12:00:00Z'),
        schedule({ quietHours: { start: '22:00', end: '07:00' } }),
      ),
    ).toBeNull()
  })

  it('holds until quiet hours end', () => {
    const decision = computeDeliveryDecision(
      at('2026-05-01T03:00:00Z'),
      schedule({ quietHours: { start: '22:00', end: '07:00' } }),
    )
    expect(decision).toEqual({
      deliverAfter: at('2026-05-01T07:00:00Z'),
      reason: 'quiet_hours',
    })
  })

  it('pushes a digest that would land in quiet hours to their end', () => {
    // 21:50 + 15 min = 22:05, inside 22:00–07:00
    const decision = computeDeliveryDecision(
      at('2026-05-01T21:50:00Z'),
      schedule({
        digestMode: 'window',
        digestWindowMinutes: 15,
        quietHours: { start: '22:00', end: '07:00' },
      }),
    )
    expect(decision).toEqual({
      deliverAfter: at('2026-05-02T07:00:00Z'),
      reason: 'quiet_hours',
    })
  })

  it('keeps a digest that lands after quiet hours end', () => {
    const decision = computeDeliveryDecision(
      at('2026-05-01T06:50:00Z'),
      schedule({
        digestMode: 'window',
        digestWindowMinutes: 15,
        quietHours: { start: '22:00', end: '07:00' },
      }),
    )
    expect(decision).toEqual({
      deliverAfter: at('2026-05-01T07:05:00Z'),
      reason: 'digest',
    })
  })

  it('evaluates quiet hours in the user time zone', () => {
    // 12:00Z is 21:00 in Tokyo; quiet 20:00–08:00 Tokyo ends at 23:00Z
    const decision = computeDeliveryDecision(
      at('2026-05-01T12:00:00Z'),
      schedule({
        timeZone: 'Asia/Tokyo',
        quietHours: { start: '20:00', end: '08:00' },
      }),
    )
    expect(decision && iso(decision.deliverAfter)).toBe(
      '2026-05-01T23:00:00.000Z',
    )
  })
})
