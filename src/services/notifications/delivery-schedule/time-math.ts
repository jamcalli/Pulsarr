/**
 * Time-of-day math for quiet hours and daily digests.
 *
 * Pure functions over `Intl` (no tz library). Wall-clock times are "HH:MM"
 * strings interpreted in an IANA time zone. DST: a wall time skipped by a
 * spring-forward gap resolves to the instant the gap ends (02:30 → 03:00), and
 * a wall time that occurs twice on a fall-back day yields both instants.
 */

const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS

const TIME_OF_DAY = /^([01]\d|2[0-3]):([0-5]\d)$/

const formatterCache = new Map<string, Intl.DateTimeFormat>()

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
    formatterCache.set(timeZone, formatter)
  }
  return formatter
}

export interface WallClock {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

/** The server's zone (honours the TZ env var used by Docker images). */
export function getServerTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

export function parseTimeOfDay(value: string): number | null {
  const match = TIME_OF_DAY.exec(value)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

export function toWallClock(instant: number, timeZone: string): WallClock {
  const parts: Record<string, number> = {}
  for (const part of getFormatter(timeZone).formatToParts(instant)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value)
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
  }
}

/** UTC offset of `timeZone` at `instant`, in ms (east of UTC is positive). */
function offsetAt(instant: number, timeZone: string): number {
  const floored = Math.floor(instant / MINUTE_MS) * MINUTE_MS
  const wall = toWallClock(floored, timeZone)
  const asUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
  )
  return asUtc - floored
}

/**
 * Every instant whose wall time in `timeZone` is `wall`, ascending: one
 * normally, two inside a fall-back overlap. A spring-forward gap has none, so
 * the instant the gap ends is returned instead.
 */
export function wallClockInstants(wall: WallClock, timeZone: string): number[] {
  const asUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
  )
  // Zones change offset at most once within a day either side of any instant
  const offsetBefore = offsetAt(asUtc - DAY_MS, timeZone)
  const offsetAfter = offsetAt(asUtc + DAY_MS, timeZone)

  const candidates = [...new Set([offsetBefore, offsetAfter])]
    .map((offset) => asUtc - offset)
    .filter((instant) => {
      const back = toWallClock(instant, timeZone)
      return (
        back.day === wall.day &&
        back.hour === wall.hour &&
        back.minute === wall.minute
      )
    })
    .sort((a, b) => a - b)

  if (candidates.length > 0) return candidates

  // Gap: binary-search the transition between the two offsets (minute precision)
  let lo = asUtc - offsetAfter
  let hi = asUtc - offsetBefore
  while (hi - lo > MINUTE_MS) {
    const mid = lo + Math.floor((hi - lo) / 2 / MINUTE_MS) * MINUTE_MS
    if (offsetAt(mid, timeZone) === offsetAfter) hi = mid
    else lo = mid
  }
  return [hi]
}

/** Converts a wall-clock time in `timeZone` to an epoch instant (ms). */
export function fromWallClock(wall: WallClock, timeZone: string): number {
  return wallClockInstants(wall, timeZone)[0]
}

/** First instant after `instant` with wall time `minutes`, starting at `day`. */
function nextWallTimeAfter(
  instant: number,
  day: WallClock,
  minutes: number,
  timeZone: string,
): number {
  // Two days always suffice; the bound only guards against a broken zone
  for (let offset = 0; offset < 3; offset++) {
    const target = atTime(addDays(day, offset), minutes)
    const match = wallClockInstants(target, timeZone).find((t) => t > instant)
    if (match !== undefined) return match
  }
  return instant + DAY_MS
}

function minutesOfDay(wall: WallClock): number {
  return wall.hour * 60 + wall.minute
}

/** Adds whole calendar days to a wall-clock date (time fields preserved). */
function addDays(wall: WallClock, days: number): WallClock {
  const date = new Date(Date.UTC(wall.year, wall.month - 1, wall.day + days))
  return {
    ...wall,
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  }
}

function atTime(wall: WallClock, minutes: number): WallClock {
  return { ...wall, hour: Math.floor(minutes / 60), minute: minutes % 60 }
}

export interface QuietHoursWindow {
  start: string
  end: string
  timeZone: string
}

/**
 * Whether `instant` falls inside the quiet window. Start is inclusive, end is
 * exclusive; a window whose start is after its end crosses midnight. A window
 * with start === end is treated as empty (never quiet).
 */
export function isWithinQuietHours(
  instant: number,
  window: QuietHoursWindow,
): boolean {
  const start = parseTimeOfDay(window.start)
  const end = parseTimeOfDay(window.end)
  if (start === null || end === null || start === end) return false

  const now = minutesOfDay(toWallClock(instant, window.timeZone))
  return start < end ? now >= start && now < end : now >= start || now < end
}

/**
 * The instant the quiet window containing `instant` ends, or null when
 * `instant` is not in quiet hours.
 */
export function getQuietHoursEnd(
  instant: number,
  window: QuietHoursWindow,
): number | null {
  if (!isWithinQuietHours(instant, window)) return null

  const end = parseTimeOfDay(window.end) as number
  const wall = toWallClock(instant, window.timeZone)
  // Before the end time today → ends today; otherwise (evening half of an
  // overnight window) → ends tomorrow
  const day = minutesOfDay(wall) < end ? wall : addDays(wall, 1)
  return nextWallTimeAfter(instant, day, end, window.timeZone)
}

/** The next instant strictly after `instant` whose wall time is `time`. */
export function getNextTimeOfDay(
  instant: number,
  time: string,
  timeZone: string,
): number | null {
  const minutes = parseTimeOfDay(time)
  if (minutes === null) return null

  return nextWallTimeAfter(
    instant,
    toWallClock(instant, timeZone),
    minutes,
    timeZone,
  )
}
