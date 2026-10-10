import { setFormatLocale } from '@/lib/format'
import {
  cronForDayTime,
  cronForIntervalHours,
  INTERVAL_HOURS,
  intervalOptions,
  parseDayTimeCron,
  scheduleDayOptions,
  scheduleTimeOptions,
  timeFromScheduleValue,
} from '@/lib/schedule'

describe('cronForIntervalHours', () => {
  it('runs at the top of every Nth hour', () => {
    expect(cronForIntervalHours(4)).toBe('0 */4 * * *')
  })
})

describe('intervalOptions', () => {
  beforeEach(() => {
    setFormatLocale('en-US')
  })

  afterEach(() => {
    setFormatLocale(undefined)
  })

  it('offers one option per preset interval', () => {
    expect(intervalOptions('0 */4 * * *')).toEqual([
      { value: '0 */1 * * *', label: 'Every hour' },
      { value: '0 */2 * * *', label: 'Every 2 hours' },
      { value: '0 */3 * * *', label: 'Every 3 hours' },
      { value: '0 */4 * * *', label: 'Every 4 hours' },
      { value: '0 */6 * * *', label: 'Every 6 hours' },
      { value: '0 */8 * * *', label: 'Every 8 hours' },
      { value: '0 */12 * * *', label: 'Every 12 hours' },
    ])
  })

  it('adds the current expression as a custom option when no preset matches', () => {
    const options = intervalOptions('30 2 * * 1')
    expect(options).toHaveLength(INTERVAL_HOURS.length + 1)
    expect(options.at(-1)).toEqual({
      value: '30 2 * * 1',
      label: 'Custom: 30 2 * * 1',
    })
  })

  it('does not duplicate a preset that matches the current expression', () => {
    const values = intervalOptions('0 */12 * * *').map(({ value }) => value)
    expect(values).toHaveLength(INTERVAL_HOURS.length)
    expect(new Set(values).size).toBe(values.length)
  })
})

describe('parseDayTimeCron', () => {
  it('reads five-field day and time schedules', () => {
    expect(parseDayTimeCron('0 2 * * *')).toEqual({
      day: '*',
      hour: 2,
      minute: 0,
    })
    expect(parseDayTimeCron('30 2 * * 0')).toEqual({
      day: '0',
      hour: 2,
      minute: 30,
    })
    expect(parseDayTimeCron('45 23 * * 6')).toEqual({
      day: '6',
      hour: 23,
      minute: 45,
    })
  })

  it('reads six-field schedules with a zero seconds field', () => {
    expect(parseDayTimeCron('0 0 2 * * *')).toEqual({
      day: '*',
      hour: 2,
      minute: 0,
    })
    expect(parseDayTimeCron('0 30 14 * * 3')).toEqual({
      day: '3',
      hour: 14,
      minute: 30,
    })
  })

  it('reads a minute off the 15-minute grid as a time', () => {
    expect(parseDayTimeCron('7 2 * * *')).toEqual({
      day: '*',
      hour: 2,
      minute: 7,
    })
  })

  it('rejects anything the day and time pickers cannot show', () => {
    for (const expression of [
      '0 */4 * * *',
      '0 0 2 * * 1-5',
      '15 0 2 * * *',
      '*/5 0 2 * * *',
      '0 2 * * 1-5',
      '0 2,14 * * *',
      '0 2 1 * *',
      '0 2 * 6 *',
      '0 24 * * *',
      '60 2 * * *',
      '0 0 24 * * *',
      '0 60 2 * * *',
      '0 2 * * 7',
      '0 2 * * MON',
      '0 0 0 2 * * *',
      '',
    ]) {
      expect(parseDayTimeCron(expression)).toBeNull()
    }
  })

  it('always builds five fields', () => {
    expect(cronForDayTime({ day: '3', hour: 14, minute: 30 })).toBe(
      '30 14 * * 3',
    )
    expect(cronForDayTime({ day: '*', hour: 0, minute: 0 })).toBe('0 0 * * *')
  })

  it('keeps the schedule through a parse and build round trip', () => {
    for (const expression of [
      '0 0 2 * * *',
      '0 30 14 * * 3',
      '30 2 * * 0',
      '7 2 * * *',
    ]) {
      const schedule = parseDayTimeCron(expression)
      expect(schedule).not.toBeNull()
      if (!schedule) continue
      expect(parseDayTimeCron(cronForDayTime(schedule))).toEqual(schedule)
    }
  })
})

describe('schedule picker options', () => {
  beforeEach(() => {
    setFormatLocale('en-US')
  })

  afterEach(() => {
    setFormatLocale(undefined)
  })

  it('offers every day and each weekday as a cron day', () => {
    const options = scheduleDayOptions()
    expect(options.map(({ value }) => value)).toEqual([
      '*',
      '0',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
    ])
    expect(options[0].label).toBe('Every day')
    expect(options[1].label).toBe('Sunday')
  })

  it('offers every 15 minutes in the locale clock', () => {
    const options = scheduleTimeOptions(null)
    expect(options).toHaveLength(96)
    expect(options[0].label).toMatch(/^12:00\sAM$/)
    expect(options[1].label).toMatch(/^12:15\sAM$/)
    expect(timeFromScheduleValue(options[58].value)).toEqual({
      hour: 14,
      minute: 30,
    })
    setFormatLocale('de-DE')
    expect(scheduleTimeOptions(null)[54].label).toBe('13:30')
  })

  it('adds a stored time off the grid as its own time', () => {
    const options = scheduleTimeOptions({ hour: 2, minute: 7 })
    expect(options).toHaveLength(97)
    expect(options.at(-1)?.label).toMatch(/^2:07\sAM$/)
    expect(timeFromScheduleValue(options.at(-1)?.value ?? '')).toEqual({
      hour: 2,
      minute: 7,
    })
    expect(scheduleTimeOptions({ hour: 2, minute: 30 })).toHaveLength(96)
  })
})
