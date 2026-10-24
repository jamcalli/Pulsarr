import {
  durationScale,
  pickDurationUnit,
  roundDuration,
  toUnit,
  unitWord,
} from '@/features/home/lib/duration'
import { setFormatLocale } from '@/lib/format'

const HOUR = 1 / 24

describe('pickDurationUnit', () => {
  it('picks minutes below two hours', () => {
    expect(pickDurationUnit(0)).toBe('minutes')
    expect(pickDurationUnit(2 * HOUR - 0.0001)).toBe('minutes')
  })

  it('picks hours from two hours up to two days', () => {
    expect(pickDurationUnit(2 * HOUR)).toBe('hours')
    expect(pickDurationUnit(1.99)).toBe('hours')
  })

  it('picks days from two days up', () => {
    expect(pickDurationUnit(2)).toBe('days')
    expect(pickDurationUnit(40)).toBe('days')
  })
})

describe('toUnit', () => {
  it('converts days into each unit', () => {
    expect(toUnit(0.5, 'minutes')).toBe(720)
    expect(toUnit(0.5, 'hours')).toBe(12)
    expect(toUnit(0.5, 'days')).toBe(0.5)
  })
})

describe('roundDuration', () => {
  it('keeps one decimal under 10 and none from 10 up', () => {
    expect(roundDuration(3.46)).toBe(3.5)
    expect(roundDuration(9.94)).toBe(9.9)
    expect(roundDuration(14.6)).toBe(15)
  })
})

describe('unitWord', () => {
  beforeEach(() => setFormatLocale('en-US'))
  afterEach(() => setFormatLocale(undefined))

  it('agrees with the value', () => {
    expect(unitWord(1, 'hours')).toBe('hour')
    expect(unitWord(1.5, 'hours')).toBe('hours')
    expect(unitWord(1, 'minutes')).toBe('min')
    expect(unitWord(3, 'days')).toBe('days')
  })
})

describe('durationScale', () => {
  it('rounds the domain up to a nice step with 4 or 5 ticks', () => {
    expect(durationScale(42)).toEqual({
      domainMax: 60,
      ticks: [0, 20, 40, 60],
    })
    expect(durationScale(3.7)).toEqual({
      domainMax: 4,
      ticks: [0, 1, 2, 3, 4],
    })
  })

  it('keeps every tick count between 4 and 5', () => {
    for (const max of [0.3, 1, 3.7, 7, 19, 42, 99, 118, 365]) {
      const { ticks, domainMax } = durationScale(max)
      expect(ticks.length).toBeGreaterThanOrEqual(4)
      expect(ticks.length).toBeLessThanOrEqual(5)
      expect(domainMax).toBeGreaterThanOrEqual(max)
    }
  })

  it('falls back to a unit domain when there is nothing to scale', () => {
    expect(durationScale(0)).toEqual({ domainMax: 1, ticks: [0, 1] })
  })
})
