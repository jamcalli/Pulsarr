import type { PlexSession } from '@root/types/plex-session.types.js'
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
  type FakeSonarrService,
  makeEpisodeSession,
  makeEpisodesSeason2Unmonitored,
  makeEpisodesWithFiles,
  makeFakeSonarr,
  makeShowMetadata,
  makeSonarrSeries,
  sessionMonitoringConfig,
} from '../../../helpers/session-monitor-fixtures.js'

describe('Session Monitoring → Season Episode Counts Integration', () => {
  let app: FastifyInstance

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
    await app.updateConfig({
      plexSessionMonitoring: sessionMonitoringConfig({
        enableProgressiveCleanup: false,
      }),
    })
  })

  function stubBoundaries(session: PlexSession, fakeSonarr: object) {
    app.plexServerService.getActiveSessions = vi
      .fn()
      .mockResolvedValue([session])
    app.plexServerService.getShowMetadata = vi
      .fn()
      .mockResolvedValue(makeShowMetadata('90210'))
    app.sonarrManager.getSonarrService = vi
      .fn()
      .mockReturnValue(
        fakeSonarr as unknown as ReturnType<
          typeof app.sonarrManager.getSonarrService
        >,
      )
  }

  async function insertMasterShow(
    monitoringType:
      | 'firstSeasonRolling'
      | 'pilotRolling'
      | 'allSeasonPilotRolling',
  ) {
    await insertRollingShow(getTestDatabase(), {
      show_title: 'Stella',
      monitoring_type: monitoringType,
      sonarr_series_id: 1566,
      sonarr_instance_id: 1,
      tvdb_id: '90210',
      current_monitored_season: 1,
    })
  }

  async function storedCounts() {
    const {
      shows: [master],
    } = await app.db.getRollingMonitoredShowMatches('90210', 'Stella')
    return master?.season_episode_counts
  }

  it('stores season statistics from the end-of-season check', async () => {
    await insertMasterShow('firstSeasonRolling')
    const fakeSonarr = makeFakeSonarr({
      getSeriesById: vi.fn().mockResolvedValue(makeSonarrSeries(1566, 2)),
      getEpisodes: vi
        .fn()
        .mockResolvedValue(makeEpisodesSeason2Unmonitored(1566)),
    })
    stubBoundaries(makeEpisodeSession({ season: 1, episode: 5 }), fakeSonarr)

    await app.plexSessionMonitor.monitorSessions()

    expect(fakeSonarr.getSeriesById).toHaveBeenCalledTimes(1)
    expect(await storedCounts()).toEqual({ 1: 16, 2: 16 })
  })

  it('stores episode counts from the pilot expansion', async () => {
    await insertMasterShow('pilotRolling')
    const fakeSonarr = makeFakeSonarr({
      getEpisodes: vi
        .fn()
        .mockResolvedValue(makeEpisodesWithFiles([1, 2, 3], 1566)),
    })
    stubBoundaries(makeEpisodeSession({ season: 1, episode: 1 }), fakeSonarr)

    await app.plexSessionMonitor.monitorSessions()

    expect(fakeSonarr.getSeriesById).not.toHaveBeenCalled()
    expect(await storedCounts()).toEqual({ 1: 10, 2: 10, 3: 10 })
  })

  it('stores episode counts when seeding every season pilot', async () => {
    await insertMasterShow('allSeasonPilotRolling')
    const fakeSonarr = {
      ...makeFakeSonarr({
        getEpisodes: vi
          .fn()
          .mockResolvedValue(makeEpisodesWithFiles([1, 2], 1566)),
      }),
      waitForAddComplete: vi.fn().mockResolvedValue(undefined),
      updateSeriesMonitoring: vi.fn().mockResolvedValue(true),
      searchEpisodes: vi.fn().mockResolvedValue(true),
    }
    stubBoundaries(makeEpisodeSession({ season: 1, episode: 1 }), fakeSonarr)

    await app.plexSessionMonitor.monitorAllSeasonPilots(1566, 1)

    expect(await storedCounts()).toEqual({ 1: 10, 2: 10 })
  })

  describe('refresh on position change', () => {
    let fakeSonarr: FakeSonarrService

    beforeEach(async () => {
      await insertMasterShow('allSeasonPilotRolling')
      fakeSonarr = makeFakeSonarr({
        getSeriesById: vi.fn().mockResolvedValue(makeSonarrSeries(1566, 3)),
      })
      stubBoundaries(makeEpisodeSession({ season: 2, episode: 4 }), fakeSonarr)
    })

    it('makes no Sonarr call on a repeated event at the same position', async () => {
      await app.plexSessionMonitor.monitorSessions()
      await app.plexSessionMonitor.monitorSessions()

      expect(fakeSonarr.getSeriesById).toHaveBeenCalledTimes(1)
      expect(await storedCounts()).toEqual({ 1: 16, 2: 16, 3: 16 })
    })

    it('refreshes a season length that grew since it was stored', async () => {
      await app.db.updateRollingShowSeasonEpisodeCounts(1566, 1, {
        1: 16,
        2: 8,
        3: 16,
      })

      await app.plexSessionMonitor.monitorSessions()

      expect(fakeSonarr.getSeriesById).toHaveBeenCalledTimes(1)
      expect(await storedCounts()).toEqual({ 1: 16, 2: 16, 3: 16 })
    })

    it('skips the write when the next position finds the same lengths', async () => {
      await app.plexSessionMonitor.monitorSessions()
      const write = vi.spyOn(app.db, 'updateRollingShowSeasonEpisodeCounts')
      stubBoundaries(makeEpisodeSession({ season: 2, episode: 5 }), fakeSonarr)

      await app.plexSessionMonitor.monitorSessions()

      expect(fakeSonarr.getSeriesById).toHaveBeenCalledTimes(2)
      expect(write).not.toHaveBeenCalled()
      write.mockRestore()
    })
  })
})
