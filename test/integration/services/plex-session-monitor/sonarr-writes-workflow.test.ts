import { ROLLING_BASELINE_SEASON } from '@root/schemas/sonarr/season-monitoring.schema.js'
import type { RollingMonitoredShow } from '@root/types/plex-session.types.js'
import type { SonarrEpisode, SonarrSeries } from '@root/types/sonarr.types.js'
import type { FastifyInstance } from 'fastify'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { build } from '../../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../../helpers/database.js'
import { insertRollingShow } from '../../../helpers/rolling-shows.js'
import { seedAll } from '../../../helpers/seeds/index.js'
import {
  makeEpisodeSession,
  makeShowMetadata,
  sessionMonitoringConfig,
} from '../../../helpers/session-monitor-fixtures.js'

type SonarrWrite = [method: string, ...args: unknown[]]

interface EpisodeState {
  monitored: boolean
  hasFile: boolean
}

// Seasons 0 (specials) to 3, three episodes each. Episode id is season*100+episode, file id season*1000+episode.
const BASE_STATE: Record<string, EpisodeState> = {
  S0E1: { monitored: true, hasFile: true },
  S0E2: { monitored: false, hasFile: false },
  S0E3: { monitored: false, hasFile: false },
  S1E1: { monitored: true, hasFile: true },
  S1E2: { monitored: true, hasFile: true },
  S1E3: { monitored: false, hasFile: true },
  S2E1: { monitored: true, hasFile: true },
  S2E2: { monitored: true, hasFile: false },
  S2E3: { monitored: false, hasFile: false },
  S3E1: { monitored: false, hasFile: false },
  S3E2: { monitored: false, hasFile: false },
  S3E3: { monitored: false, hasFile: false },
}

function makeEpisodes(
  overrides: Record<string, Partial<EpisodeState>> = {},
): SonarrEpisode[] {
  return Object.entries(BASE_STATE).map(([code, base]) => {
    const [, season, episode] = code.match(/^S(\d)E(\d)$/) ?? []
    const seasonNumber = Number(season)
    const episodeNumber = Number(episode)
    const state = { ...base, ...overrides[code] }
    return {
      id: seasonNumber * 100 + episodeNumber,
      seriesId: 1566,
      episodeFileId: state.hasFile ? seasonNumber * 1000 + episodeNumber : 0,
      seasonNumber,
      episodeNumber,
      title: code,
      hasFile: state.hasFile,
      monitored: state.monitored,
      unverifiedSceneNumbering: false,
      grabbed: false,
    }
  })
}

const SERIES = {
  title: 'Stella',
  tvdbId: 90210,
  id: 1566,
  seasons: [0, 1, 2, 3].map((seasonNumber) => ({
    seasonNumber,
    monitored: true,
    statistics: { totalEpisodeCount: 3 },
  })),
} as unknown as SonarrSeries

function withEmptySeason4(monitored: boolean): SonarrSeries {
  return {
    ...SERIES,
    seasons: [
      ...(SERIES.seasons ?? []),
      { seasonNumber: 4, monitored, statistics: { totalEpisodeCount: 0 } },
    ],
  }
}

describe('Session monitoring Sonarr writes', () => {
  let app: FastifyInstance
  let writes: SonarrWrite[]

  beforeAll(async () => {
    app = await build()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    await resetDatabase()
    await seedAll(getTestDatabase())
    writes = []
  })

  function useSonarr(episodes: SonarrEpisode[], series = SERIES) {
    const record =
      (method: string) =>
      async (...args: unknown[]) => {
        writes.push([method, ...args])
      }
    const fakeSonarr = {
      getEpisodes: vi.fn().mockResolvedValue(episodes),
      getSeriesById: vi.fn().mockResolvedValue(series),
      waitForAddComplete: vi.fn().mockResolvedValue(undefined),
      updateSeriesMonitoring: vi.fn(record('updateSeriesMonitoring')),
      updateSeasonMonitoring: vi.fn(record('updateSeasonMonitoring')),
      updateEpisodesMonitoring: vi.fn(record('updateEpisodesMonitoring')),
      deleteEpisodeFiles: vi.fn(record('deleteEpisodeFiles')),
      searchSeason: vi.fn(record('searchSeason')),
      searchEpisodes: vi.fn(record('searchEpisodes')),
    }
    app.sonarrManager.getSonarrService = vi
      .fn()
      .mockReturnValue(
        fakeSonarr as unknown as ReturnType<
          typeof app.sonarrManager.getSonarrService
        >,
      )
  }

  function usePlexSession(season: number, episode: number) {
    app.plexServerService.getActiveSessions = vi
      .fn()
      .mockResolvedValue([makeEpisodeSession({ season, episode })])
    app.plexServerService.getShowMetadata = vi
      .fn()
      .mockResolvedValue(makeShowMetadata('90210'))
  }

  async function seedShow(
    monitoringType: RollingMonitoredShow['monitoring_type'],
    viewer: Partial<RollingMonitoredShow> = {},
    lastUpdatedAt = new Date().toISOString(),
  ) {
    const knex = getTestDatabase()
    const base = {
      show_title: 'Stella',
      monitoring_type: monitoringType,
      sonarr_series_id: 1566,
      sonarr_instance_id: 1,
      tvdb_id: '90210',
      last_session_date: lastUpdatedAt,
      updated_at: lastUpdatedAt,
      last_updated_at: lastUpdatedAt,
    }
    const masterId = await insertRollingShow(knex, {
      ...base,
      current_monitored_season: ROLLING_BASELINE_SEASON[monitoringType],
    })
    const viewerId = await insertRollingShow(knex, {
      ...base,
      plex_user_id: 'u_nicole',
      plex_username: 'nicole3876',
      ...viewer,
    })
    return { masterId, viewerId }
  }

  async function rowById(id: number) {
    return getTestDatabase()('rolling_monitored_shows').where({ id }).first()
  }

  describe('reset to baseline (inactive reset)', () => {
    const longAgo = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString()

    it('pilotRolling keeps S01E01 only and unmonitors seasons above 1', async () => {
      const { masterId, viewerId } = await seedShow(
        'pilotRolling',
        { last_watched_season: 2, current_monitored_season: 3 },
        longAgo,
      )
      useSonarr(makeEpisodes())

      await app.plexSessionMonitor.resetInactiveRollingShows(7)

      expect(writes).toMatchInlineSnapshot(`
        [
          [
            "deleteEpisodeFiles",
            [
              1,
              1002,
              1003,
              2001,
            ],
          ],
          [
            "updateEpisodesMonitoring",
            [
              {
                "id": 1,
                "monitored": false,
              },
              {
                "id": 102,
                "monitored": false,
              },
              {
                "id": 201,
                "monitored": false,
              },
              {
                "id": 202,
                "monitored": false,
              },
            ],
          ],
          [
            "updateSeasonMonitoring",
            1566,
            2,
            false,
          ],
          [
            "updateSeasonMonitoring",
            1566,
            3,
            false,
          ],
        ]
      `)
      expect(await rowById(viewerId)).toBeUndefined()
      expect(await rowById(masterId)).toMatchObject({
        current_monitored_season: 1,
        last_watched_season: 0,
      })
    })

    it('pilotRolling leaves Sonarr and the rows alone when S01E01 is missing', async () => {
      const { viewerId } = await seedShow(
        'pilotRolling',
        { last_watched_season: 2 },
        longAgo,
      )
      useSonarr(makeEpisodes().filter((ep) => ep.id !== 101))

      await app.plexSessionMonitor.resetInactiveRollingShows(7)

      expect(writes).toEqual([])
      expect(await rowById(viewerId)).toBeDefined()
    })

    it('firstSeasonRolling keeps seasons 0 and 1 and unmonitors seasons above 1', async () => {
      const { masterId, viewerId } = await seedShow(
        'firstSeasonRolling',
        { last_watched_season: 2, current_monitored_season: 3 },
        longAgo,
      )
      useSonarr(makeEpisodes())

      await app.plexSessionMonitor.resetInactiveRollingShows(7)

      expect(writes).toMatchInlineSnapshot(`
        [
          [
            "deleteEpisodeFiles",
            [
              2001,
            ],
          ],
          [
            "updateEpisodesMonitoring",
            [
              {
                "id": 201,
                "monitored": false,
              },
              {
                "id": 202,
                "monitored": false,
              },
            ],
          ],
          [
            "updateSeasonMonitoring",
            1566,
            2,
            false,
          ],
          [
            "updateSeasonMonitoring",
            1566,
            3,
            false,
          ],
        ]
      `)
      expect(await rowById(viewerId)).toBeUndefined()
      expect(await rowById(masterId)).toMatchObject({
        current_monitored_season: 1,
      })
    })

    it('allSeasonPilotRolling keeps every season pilot and re-monitors unmonitored pilots', async () => {
      const { masterId, viewerId } = await seedShow(
        'allSeasonPilotRolling',
        { last_watched_season: 2, current_monitored_season: 3 },
        longAgo,
      )
      useSonarr(makeEpisodes())

      await app.plexSessionMonitor.resetInactiveRollingShows(7)

      expect(writes).toMatchInlineSnapshot(`
        [
          [
            "deleteEpisodeFiles",
            [
              1,
              1002,
              1003,
            ],
          ],
          [
            "updateEpisodesMonitoring",
            [
              {
                "id": 1,
                "monitored": false,
              },
              {
                "id": 102,
                "monitored": false,
              },
              {
                "id": 202,
                "monitored": false,
              },
            ],
          ],
          [
            "updateSeasonMonitoring",
            1566,
            1,
            false,
          ],
          [
            "updateSeasonMonitoring",
            1566,
            2,
            false,
          ],
          [
            "updateSeasonMonitoring",
            1566,
            3,
            false,
          ],
          [
            "updateEpisodesMonitoring",
            [
              {
                "id": 301,
                "monitored": true,
              },
            ],
          ],
        ]
      `)
      expect(await rowById(viewerId)).toBeUndefined()
      expect(await rowById(masterId)).toMatchObject({
        current_monitored_season: 0,
      })
    })
  })

  describe('expansion', () => {
    beforeEach(async () => {
      await app.updateConfig({
        plexSessionMonitoring: sessionMonitoringConfig({
          enableProgressiveCleanup: false,
        }),
      })
    })

    it('monitors and searches the next season near the end of the current one', async () => {
      const { masterId, viewerId } = await seedShow('firstSeasonRolling', {
        last_watched_season: 1,
        last_watched_episode: 1,
      })
      useSonarr(makeEpisodes())
      usePlexSession(1, 2)

      const result = await app.plexSessionMonitor.monitorSessions()

      expect(writes).toMatchInlineSnapshot(`
        [
          [
            "updateSeasonMonitoring",
            1566,
            2,
            true,
          ],
          [
            "updateEpisodesMonitoring",
            [
              {
                "id": 203,
                "monitored": true,
              },
            ],
          ],
          [
            "searchSeason",
            1566,
            2,
          ],
        ]
      `)
      expect(result.triggeredSearches).toBe(1)
      expect(await rowById(viewerId)).toMatchObject({
        current_monitored_season: 2,
        last_watched_season: 1,
        last_watched_episode: 2,
      })
      expect(await rowById(masterId)).toMatchObject({
        current_monitored_season: 2,
      })
    })

    it('raises the marks without telling Sonarr when the next season is already fully monitored', async () => {
      const { masterId, viewerId } = await seedShow('firstSeasonRolling', {
        last_watched_season: 1,
        last_watched_episode: 1,
      })
      useSonarr(makeEpisodes({ S2E3: { monitored: true } }))
      usePlexSession(1, 2)

      const result = await app.plexSessionMonitor.monitorSessions()

      expect(writes).toEqual([])
      expect(result.triggeredSearches).toBe(0)
      expect(result.rollingUpdates).toEqual([])
      expect(await rowById(viewerId)).toMatchObject({
        current_monitored_season: 2,
      })
      expect(await rowById(masterId)).toMatchObject({
        current_monitored_season: 2,
      })
    })

    it('monitors a next season that has no episodes yet without searching', async () => {
      const { viewerId } = await seedShow('firstSeasonRolling', {
        last_watched_season: 3,
        last_watched_episode: 1,
        current_monitored_season: 3,
      })
      useSonarr(makeEpisodes(), withEmptySeason4(false))
      usePlexSession(3, 2)

      const result = await app.plexSessionMonitor.monitorSessions()

      expect(writes).toMatchInlineSnapshot(`
        [
          [
            "updateSeasonMonitoring",
            1566,
            4,
            true,
          ],
        ]
      `)
      expect(result.triggeredSearches).toBe(0)
      expect(result.rollingUpdates).toHaveLength(1)
      expect(await rowById(viewerId)).toMatchObject({
        current_monitored_season: 4,
        last_watched_season: 3,
        last_watched_episode: 2,
      })
    })

    it('raises the master without telling Sonarr when the empty next season was already monitored ahead', async () => {
      const { masterId, viewerId } = await seedShow('firstSeasonRolling', {
        last_watched_season: 3,
        last_watched_episode: 2,
        current_monitored_season: 4,
      })
      useSonarr(makeEpisodes(), withEmptySeason4(true))
      usePlexSession(3, 3)

      const result = await app.plexSessionMonitor.monitorSessions()

      expect(writes).toEqual([])
      expect(result.rollingUpdates).toEqual([])
      expect(await rowById(viewerId)).toMatchObject({
        current_monitored_season: 4,
      })
      expect(await rowById(masterId)).toMatchObject({
        current_monitored_season: 4,
      })
    })

    it('expands season 1 when a pilotRolling viewer watches S01E01', async () => {
      const { viewerId } = await seedShow('pilotRolling')
      useSonarr(makeEpisodes())
      usePlexSession(1, 1)

      const result = await app.plexSessionMonitor.monitorSessions()

      expect(writes).toMatchInlineSnapshot(`
        [
          [
            "updateSeasonMonitoring",
            1566,
            1,
            true,
          ],
          [
            "updateEpisodesMonitoring",
            [
              {
                "id": 103,
                "monitored": true,
              },
            ],
          ],
          [
            "searchSeason",
            1566,
            1,
          ],
        ]
      `)
      expect(result.triggeredSearches).toBe(1)
      expect(await rowById(viewerId)).toMatchObject({
        current_monitored_season: 1,
      })
    })

    it('expands the watched season when an allSeasonPilotRolling viewer watches its E01', async () => {
      const { viewerId } = await seedShow('allSeasonPilotRolling', {
        current_monitored_season: 1,
      })
      useSonarr(makeEpisodes())
      usePlexSession(3, 1)

      const result = await app.plexSessionMonitor.monitorSessions()

      expect(writes).toMatchInlineSnapshot(`
        [
          [
            "updateSeasonMonitoring",
            1566,
            3,
            true,
          ],
          [
            "updateEpisodesMonitoring",
            [
              {
                "id": 301,
                "monitored": true,
              },
              {
                "id": 302,
                "monitored": true,
              },
              {
                "id": 303,
                "monitored": true,
              },
            ],
          ],
          [
            "searchSeason",
            1566,
            3,
          ],
        ]
      `)
      expect(result.triggeredSearches).toBe(1)
      expect(await rowById(viewerId)).toMatchObject({
        current_monitored_season: 3,
      })
    })
  })

  describe('progressive cleanup', () => {
    beforeEach(async () => {
      await app.updateConfig({
        plexSessionMonitoring: sessionMonitoringConfig(),
      })
    })

    it('firstSeasonRolling removes the season behind the viewer', async () => {
      await seedShow('firstSeasonRolling', {
        last_watched_season: 2,
        last_watched_episode: 3,
        current_monitored_season: 3,
      })
      useSonarr(makeEpisodes())
      usePlexSession(3, 1)

      await app.plexSessionMonitor.monitorSessions()

      expect(writes).toMatchInlineSnapshot(`
        [
          [
            "deleteEpisodeFiles",
            [
              2001,
            ],
          ],
          [
            "updateEpisodesMonitoring",
            [
              {
                "id": 201,
                "monitored": false,
              },
              {
                "id": 202,
                "monitored": false,
              },
            ],
          ],
          [
            "updateSeasonMonitoring",
            1566,
            2,
            false,
          ],
        ]
      `)
    })

    it('pilotRolling resets season 1 to its pilot and removes the season behind the viewer', async () => {
      await seedShow('pilotRolling', {
        last_watched_season: 2,
        last_watched_episode: 3,
        current_monitored_season: 3,
      })
      useSonarr(makeEpisodes())
      usePlexSession(3, 1)

      await app.plexSessionMonitor.monitorSessions()

      expect(writes).toMatchInlineSnapshot(`
        [
          [
            "deleteEpisodeFiles",
            [
              1002,
              1003,
            ],
          ],
          [
            "updateEpisodesMonitoring",
            [
              {
                "id": 102,
                "monitored": false,
              },
            ],
          ],
          [
            "deleteEpisodeFiles",
            [
              2001,
            ],
          ],
          [
            "updateEpisodesMonitoring",
            [
              {
                "id": 201,
                "monitored": false,
              },
              {
                "id": 202,
                "monitored": false,
              },
            ],
          ],
          [
            "updateSeasonMonitoring",
            1566,
            2,
            false,
          ],
        ]
      `)
    })

    it('pilotRolling keeps season 1 files when only the pilot is already monitored', async () => {
      await seedShow('pilotRolling', {
        last_watched_season: 2,
        last_watched_episode: 3,
        current_monitored_season: 3,
      })
      useSonarr(makeEpisodes({ S1E2: { monitored: false } }))
      usePlexSession(3, 1)

      await app.plexSessionMonitor.monitorSessions()

      expect(writes).toMatchInlineSnapshot(`
        [
          [
            "deleteEpisodeFiles",
            [
              2001,
            ],
          ],
          [
            "updateEpisodesMonitoring",
            [
              {
                "id": 201,
                "monitored": false,
              },
              {
                "id": 202,
                "monitored": false,
              },
            ],
          ],
          [
            "updateSeasonMonitoring",
            1566,
            2,
            false,
          ],
        ]
      `)
    })

    it('allSeasonPilotRolling trims earlier seasons to their pilots', async () => {
      await seedShow('allSeasonPilotRolling', {
        last_watched_season: 2,
        last_watched_episode: 3,
        current_monitored_season: 3,
      })
      useSonarr(makeEpisodes({ S2E1: { monitored: false } }))
      usePlexSession(3, 2)

      await app.plexSessionMonitor.monitorSessions()

      expect(writes).toMatchInlineSnapshot(`
        [
          [
            "deleteEpisodeFiles",
            [
              1002,
              1003,
            ],
          ],
          [
            "updateEpisodesMonitoring",
            [
              {
                "id": 102,
                "monitored": false,
              },
            ],
          ],
          [
            "updateEpisodesMonitoring",
            [
              {
                "id": 202,
                "monitored": false,
              },
            ],
          ],
          [
            "updateEpisodesMonitoring",
            [
              {
                "id": 201,
                "monitored": true,
              },
            ],
          ],
        ]
      `)
    })
  })

  describe('season pilots', () => {
    it('seeds every season pilot when a show is enrolled', async () => {
      useSonarr(makeEpisodes())

      await app.plexSessionMonitor.monitorAllSeasonPilots(1566, 1)

      expect(writes).toMatchInlineSnapshot(`
        [
          [
            "updateSeriesMonitoring",
            1566,
            {
              "monitorNewItems": "none",
              "monitored": true,
            },
          ],
          [
            "updateEpisodesMonitoring",
            [
              {
                "id": 101,
                "monitored": true,
              },
              {
                "id": 201,
                "monitored": true,
              },
              {
                "id": 301,
                "monitored": true,
              },
            ],
          ],
          [
            "searchEpisodes",
            [
              101,
              201,
              301,
            ],
          ],
        ]
      `)
    })

    it('monitors and searches pilots of newly added seasons', async () => {
      await seedShow('allSeasonPilotRolling')
      useSonarr(makeEpisodes())

      await app.plexSessionMonitor.syncNewSeasonPilots()

      expect(writes).toMatchInlineSnapshot(`
        [
          [
            "updateEpisodesMonitoring",
            [
              {
                "id": 301,
                "monitored": true,
              },
            ],
          ],
          [
            "searchEpisodes",
            [
              301,
            ],
          ],
        ]
      `)
    })
  })
})
