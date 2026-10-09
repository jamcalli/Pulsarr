import { setFormatLocale } from '@/lib/format'
import {
  cronForDayHour,
  cronForIntervalHours,
  INTERVAL_HOURS,
  intervalOptions,
  parseDayHourCron,
  scheduleDayOptions,
  scheduleHourOptions,
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

describe('parseDayHourCron', () => {
  it('reads the day and hour of a day and time schedule', () => {
    expect(parseDayHourCron('0 2 * * *')).toEqual({ day: '*', hour: 2 })
    expect(parseDayHourCron('0 23 * * 6')).toEqual({ day: '6', hour: 23 })
    expect(parseDayHourCron('0 0 * * 0')).toEqual({ day: '0', hour: 0 })
  })

  it('rejects anything the day and hour pickers cannot show', () => {
    for (const expression of [
      '30 2 * * 1',
      '0 */4 * * *',
      '0 2 * * 1-5',
      '0 2,14 * * *',
      '0 2 1 * *',
      '0 2 * 6 *',
      '0 24 * * *',
      '0 2 * * 7',
      '0 2 * * MON',
      '0 0 2 * * *',
      '',
    ]) {
      expect(parseDayHourCron(expression)).toBeNull()
    }
  })

  it('round-trips through cronForDayHour', () => {
    expect(cronForDayHour({ day: '3', hour: 14 })).toBe('0 14 * * 3')
    expect(parseDayHourCron(cronForDayHour({ day: '*', hour: 5 }))).toEqual({
      day: '*',
      hour: 5,
    })
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

  it('offers each hour on the hour in the locale clock', () => {
    const options = scheduleHourOptions()
    expect(options).toHaveLength(24)
    expect(options[0].value).toBe('0')
    expect(options[0].label).toMatch(/^12:00\sAM$/)
    setFormatLocale('de-DE')
    expect(scheduleHourOptions()[13].label).toBe('13:00')
  })
})
