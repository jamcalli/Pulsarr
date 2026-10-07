import { setFormatLocale } from '@/lib/format'
import {
  cronForIntervalHours,
  INTERVAL_HOURS,
  intervalOptions,
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
