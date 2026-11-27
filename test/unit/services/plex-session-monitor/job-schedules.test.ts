import {
  isAutoResetEnabled,
  sessionMonitorJobSchedules,
} from '@services/plex-session-monitor/job-schedules.js'
import { describe, expect, it } from 'vitest'

const settings = (overrides: {
  enabled: boolean
  enableAutoReset?: boolean
  pollingIntervalMinutes?: number
  autoResetIntervalHours?: number
}) => ({
  pollingIntervalMinutes: 15,
  remainingEpisodes: 2,
  ...overrides,
})

const enabledJobs = (
  schedules: ReturnType<typeof sessionMonitorJobSchedules>,
) =>
  Object.entries(schedules)
    .filter(([, schedule]) => schedule.enabled)
    .map(([name]) => name)

describe('isAutoResetEnabled', () => {
  it('is on when monitoring is on and the auto reset setting was never saved', () => {
    expect(isAutoResetEnabled(settings({ enabled: true }))).toBe(true)
  })

  it('is off when auto reset is explicitly off', () => {
    expect(
      isAutoResetEnabled(settings({ enabled: true, enableAutoReset: false })),
    ).toBe(false)
  })

  it('is off while monitoring is off', () => {
    expect(
      isAutoResetEnabled(settings({ enabled: false, enableAutoReset: true })),
    ).toBe(false)
  })
})

describe('sessionMonitorJobSchedules', () => {
  it('turns every job off while session monitoring is off', () => {
    expect(
      enabledJobs(
        sessionMonitorJobSchedules(
          settings({ enabled: false, enableAutoReset: true }),
        ),
      ),
    ).toEqual([])
  })

  it('turns every job off when nothing is configured', () => {
    expect(enabledJobs(sessionMonitorJobSchedules(undefined))).toEqual([])
  })

  it('turns every job on when monitoring and auto reset are on', () => {
    expect(
      enabledJobs(
        sessionMonitorJobSchedules(
          settings({ enabled: true, enableAutoReset: true }),
        ),
      ),
    ).toEqual([
      'plex-session-monitor',
      'plex-rolling-auto-reset',
      'plex-rolling-pilot-sync',
    ])
  })

  it('treats auto reset as on when the setting is missing', () => {
    expect(
      sessionMonitorJobSchedules(settings({ enabled: true }))[
        'plex-rolling-auto-reset'
      ].enabled,
    ).toBe(true)
  })

  it('leaves the other jobs on when auto reset is off', () => {
    expect(
      enabledJobs(
        sessionMonitorJobSchedules(
          settings({ enabled: true, enableAutoReset: false }),
        ),
      ),
    ).toEqual(['plex-session-monitor', 'plex-rolling-pilot-sync'])
  })

  it('takes each interval from the settings', () => {
    const schedules = sessionMonitorJobSchedules(
      settings({
        enabled: true,
        pollingIntervalMinutes: 5,
        autoResetIntervalHours: 6,
      }),
    )

    expect(schedules['plex-session-monitor'].config).toEqual({ minutes: 5 })
    expect(schedules['plex-rolling-auto-reset'].config).toEqual({ hours: 6 })
    expect(schedules['plex-rolling-pilot-sync'].config).toEqual({ hours: 6 })
  })
})
