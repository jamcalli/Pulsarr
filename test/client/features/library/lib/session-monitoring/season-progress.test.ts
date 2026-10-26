import type { RollingRecord } from '@/features/library/lib/session-monitoring/rolling-shows'
import {
  seasonProgress,
  triggerEpisode,
} from '@/features/library/lib/session-monitoring/season-progress'

function record(overrides: Partial<RollingRecord>): RollingRecord {
  return {
    id: 1,
    sonarr_series_id: 10,
    show_title: 'Severance',
    monitoring_type: 'firstSeasonRolling',
    current_monitored_season: 1,
    last_watched_season: 0,
    last_watched_episode: 0,
    last_session_date: null,
    sonarr_instance_id: 1,
    plex_user_id: null,
    plex_username: null,
    season_episode_counts: { 1: 10, 2: 10 },
    created_at: '2026-02-09T00:00:00Z',
    updated_at: '2026-02-09T00:00:00Z',
    last_updated_at: '2026-02-09T00:00:00Z',
    ...overrides,
  }
}

function viewer(season: number, episode: number, monitored = 1): RollingRecord {
  return record({
    id: 2,
    plex_user_id: '11',
    plex_username: 'mayar88',
    season_episode_counts: null,
    current_monitored_season: monitored,
    last_watched_season: season,
    last_watched_episode: episode,
  })
}

describe('triggerEpisode', () => {
  it('leaves the threshold of episodes after it', () => {
    expect(triggerEpisode(10, 2)).toBe(8)
  })

  it('clamps a short season to the first episode', () => {
    expect(triggerEpisode(2, 5)).toBe(1)
  })
})

describe('seasonProgress', () => {
  it('places the first season trigger from the threshold', () => {
    expect(seasonProgress(record({}), viewer(1, 3), 2)).toEqual({
      episode: 3,
      total: 10,
      trigger: { kind: 'episode', episode: 8, state: 'pending' },
      marker: 8,
    })
  })

  it('has no tick for a pilot rolling viewer on the pilot', () => {
    const show = record({ monitoring_type: 'pilotRolling' })
    expect(seasonProgress(show, viewer(1, 1), 2)?.trigger).toEqual({
      kind: 'none',
    })
    expect(seasonProgress(show, viewer(1, 2), 2)?.trigger).toEqual({
      kind: 'episode',
      episode: 8,
      state: 'pending',
    })
  })

  it('places the threshold trigger for a pilot rolling viewer past season 1', () => {
    const show = record({
      monitoring_type: 'pilotRolling',
      current_monitored_season: 2,
    })
    expect(seasonProgress(show, viewer(2, 1), 2)).toEqual({
      episode: 1,
      total: 10,
      trigger: { kind: 'episode', episode: 8, state: 'pending' },
      marker: 8,
    })
  })

  it('waits on the pilot for all season pilot rolling', () => {
    const show = record({ monitoring_type: 'allSeasonPilotRolling' })
    const progress = seasonProgress(show, viewer(1, 9), 2)
    expect(progress?.trigger).toEqual({ kind: 'pilot' })
    expect(progress?.marker).toBeUndefined()
  })

  it('reads the trigger as grabbed once the viewer row monitors the next season', () => {
    const show = record({ current_monitored_season: 1 })
    expect(seasonProgress(show, viewer(1, 9, 2), 2)?.trigger).toEqual({
      kind: 'episode',
      episode: 8,
      state: 'grabbed',
    })
  })

  it('reads the trigger as grabbed when another viewer already expanded the season', () => {
    const show = record({ current_monitored_season: 2 })
    expect(seasonProgress(show, viewer(1, 8, 2), 2)?.trigger).toEqual({
      kind: 'episode',
      episode: 8,
      state: 'grabbed',
    })
  })

  it('decides grabbed from the viewer row, not the show row', () => {
    const show = record({ current_monitored_season: 3 })
    expect(seasonProgress(show, viewer(1, 4), 2)?.trigger).toEqual({
      kind: 'episode',
      episode: 8,
      state: 'pending',
    })
  })

  it('reads the trigger as passed when the viewer is past it on the final season', () => {
    const show = record({ current_monitored_season: 2 })
    expect(seasonProgress(show, viewer(2, 9), 2)?.trigger).toEqual({
      kind: 'episode',
      episode: 8,
      state: 'passed',
    })
  })

  it('reads the trigger as passed when the episode runs past the stored length', () => {
    const show = record({ current_monitored_season: 2 })
    expect(seasonProgress(show, viewer(2, 12), 2)).toEqual({
      episode: 12,
      total: 10,
      trigger: { kind: 'episode', episode: 8, state: 'passed' },
      marker: 8,
    })
  })

  it('is null without a stored length for the viewer season', () => {
    expect(seasonProgress(record({}), viewer(3, 1), 2)).toBeNull()
    expect(
      seasonProgress(record({ season_episode_counts: null }), viewer(1, 1), 2),
    ).toBeNull()
  })
})
