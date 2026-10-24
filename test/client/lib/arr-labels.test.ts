import {
  MINIMUM_AVAILABILITY_LABELS,
  RADARR_MONITOR_LABELS,
} from '@root/schemas/radarr/add-options.schema'
import {
  SERIES_TYPE_LABELS,
  seasonMonitoringLabel,
  seasonMonitoringOptions,
} from '@/lib/arr-labels'

const SONARR_OPTIONS = [
  ['all', 'All episodes'],
  ['future', 'Future episodes'],
  ['missing', 'Missing episodes'],
  ['existing', 'Existing episodes'],
  ['recent', 'Recent episodes'],
  ['pilot', 'Pilot episode'],
  ['firstSeason', 'First season'],
  ['lastSeason', 'Last season'],
  ['monitorSpecials', 'Monitor specials'],
  ['unmonitorSpecials', 'Unmonitor specials'],
  ['none', 'None'],
]

const ROLLING_OPTIONS = [
  ['pilotRolling', 'Pilot rolling'],
  ['firstSeasonRolling', 'First season rolling'],
  ['allSeasonPilotRolling', 'All seasons pilot rolling'],
]

describe('arr labels', () => {
  it.each([...SONARR_OPTIONS, ...ROLLING_OPTIONS])(
    'labels season monitoring %s',
    (value, label) => {
      expect(seasonMonitoringLabel(value)).toBe(label)
    },
  )

  it.each(['latestSeason', 'unknown', 'skip', 'firstseason'])(
    'falls back to the raw season monitoring value %s',
    (value) => {
      expect(seasonMonitoringLabel(value)).toBe(value)
    },
  )

  it('labels series types, availability and monitor options', () => {
    expect(Object.values(SERIES_TYPE_LABELS)).toEqual([
      'Standard',
      'Anime',
      'Daily',
    ])
    expect(Object.entries(MINIMUM_AVAILABILITY_LABELS)).toEqual([
      ['announced', 'Announced'],
      ['inCinemas', 'In cinemas'],
      ['released', 'Released'],
    ])
    expect(Object.entries(RADARR_MONITOR_LABELS)).toEqual([
      ['movieOnly', 'Movie only'],
      ['movieAndCollection', 'Movie and collection'],
      ['none', 'None'],
    ])
  })
})

describe('seasonMonitoringOptions', () => {
  it("lists Sonarr's options in its order, then the rolling modes", () => {
    const options = seasonMonitoringOptions('all', true)
    expect(options.map(({ value, label }) => [value, label])).toEqual([
      ...SONARR_OPTIONS,
      ...ROLLING_OPTIONS,
    ])
    expect(options.some((option) => option.disabled)).toBe(false)
  })

  it('disables only the rolling modes when session monitoring is off', () => {
    const disabled = seasonMonitoringOptions('all', false)
      .filter((option) => option.disabled)
      .map((option) => option.value)
    expect(disabled).toEqual(ROLLING_OPTIONS.map(([value]) => value))
  })

  it.each(['latestSeason', 'skip', 'firstseason'])(
    'keeps a stored %s as an extra raw option',
    (stored) => {
      const options = seasonMonitoringOptions(stored, false)
      expect(options).toHaveLength(15)
      expect(options.at(-1)).toEqual({ value: stored, label: stored })
    },
  )

  it('adds no extra option for a listed or empty stored value', () => {
    expect(seasonMonitoringOptions('pilotRolling', false)).toHaveLength(14)
    expect(seasonMonitoringOptions(null, false)).toHaveLength(14)
  })
})
