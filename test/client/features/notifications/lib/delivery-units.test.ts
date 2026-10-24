import {
  hoursToMs,
  minutesToMs,
  msToHours,
  msToMinutes,
  NEW_EPISODE_THRESHOLD_HOURS,
  QUEUE_WAIT_MINUTES,
} from '@/features/notifications/lib/delivery-units'

describe('delivery units', () => {
  it('converts the stored bounds to page units', () => {
    expect(QUEUE_WAIT_MINUTES).toEqual({ min: 0, max: 30 })
    expect(NEW_EPISODE_THRESHOLD_HOURS).toEqual({ min: 0, max: 720 })
  })

  it('round trips minutes and hours through milliseconds', () => {
    expect(minutesToMs(2)).toBe(120_000)
    expect(msToMinutes(120_000)).toBe(2)
    expect(hoursToMs(48)).toBe(172_800_000)
    expect(msToHours(172_800_000)).toBe(48)
  })
})
