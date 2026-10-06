import { pluralize } from '@/lib/format'

export type DurationUnit = 'minutes' | 'hours' | 'days'

const MINUTES_PER_DAY = 24 * 60
const HOURS_PER_DAY = 24
const NICE_STEPS = [1, 2, 2.5, 5]
const MAX_TICK_STEPS = 4

const UNIT_WORDS: Record<DurationUnit, [string, string]> = {
  minutes: ['min', 'min'],
  hours: ['hour', 'hours'],
  days: ['day', 'days'],
}

export function pickDurationUnit(maxDays: number): DurationUnit {
  if (maxDays * HOURS_PER_DAY < 2) return 'minutes'
  if (maxDays < 2) return 'hours'
  return 'days'
}

export function toUnit(days: number, unit: DurationUnit): number {
  if (unit === 'minutes') return days * MINUTES_PER_DAY
  if (unit === 'hours') return days * HOURS_PER_DAY
  return days
}

/** One decimal under 10, whole numbers from 10 up. */
export function roundDuration(value: number): number {
  return value < 10 ? Math.round(value * 10) / 10 : Math.round(value)
}

export function unitWord(value: number, unit: DurationUnit): string {
  const [singular, plural] = UNIT_WORDS[unit]
  return pluralize(value, singular, plural)
}

/** A domain from zero rounded up to a nice step, with 4 or 5 evenly spaced ticks. */
export function durationScale(max: number): {
  domainMax: number
  ticks: number[]
} {
  if (max <= 0) return { domainMax: 1, ticks: [0, 1] }
  const magnitude = 10 ** Math.floor(Math.log10(max / MAX_TICK_STEPS))
  const step =
    [...NICE_STEPS, 10]
      .map((nice) => nice * magnitude)
      .find((candidate) => max / candidate <= MAX_TICK_STEPS) ?? 10 * magnitude
  const count = Math.ceil(max / step)
  const tick = (index: number) => Number((index * step).toPrecision(12))
  return {
    domainMax: tick(count),
    ticks: Array.from({ length: count + 1 }, (_, index) => tick(index)),
  }
}
