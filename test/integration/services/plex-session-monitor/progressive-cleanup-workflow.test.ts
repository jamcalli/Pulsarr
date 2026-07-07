/**
 * Integration tests for progressive cleanup multi-user safety
 *
 * Exercises monitorSessions end-to-end with real Fastify and real database.
 * Plex and Sonarr boundaries are stubbed so the test asserts on the actual
 * cleanup decisions the orchestration emits (which seasons get unmonitored,
 * which files get deleted) for each monitoring type.
 */

import type {
  PlexSession,
  RollingMonitoredShow,
} from '@root/types/plex-session.types.js'
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
import { seedAll } from '../../../helpers/seeds/index.js'

async function insertRollingShow(
  knex: ReturnType<typeof getTestDatabase>,
  overrides: Partial<RollingMonitoredShow> & {
    show_title: string
    monitoring_type: RollingMonitoredShow['monitoring_type']
    sonarr_series_id: number
    sonarr_instance_id: number
    tvdb_id: string
  },
): Promise<number> {
  const now = new Date().toISOString()
  const [result] = await knex('rolling_monitored_shows')
    .insert({
      current_monitored_season: 1,
      last_watched_season: 0,
      last_watched_episode: 0,
      last_session_date: now,
      created_at: now,
      updated_at: now,
      last_updated_at: now,
      ...overrides,
    })
    .returning('id')
  return typeof result === 'object' ? result.id : (result as number)
}

describe('Progressive Cleanup → Multi-User Safety Integration', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await build()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    await resetDatabase()
    await seedAll(getTestDatabase())
  })

  describe('Multi-user safety (firstSeasonRolling)', () => {
    it('should leave seasons protected by other active users (Stella bug scenario)', async () => {
      const knex = getTestDatabase()

      await app.updateConfig({
        plexSessionMonitoring: {
          enabled: true,
          filterUsers: [],
          enableAutoReset: false,
          remainingEpisodes: 2,
          inactivityResetDays: 7,
          autoResetIntervalHours: 24,
          pollingIntervalMinutes: 15,
          enableProgressiveCleanup: true,
        },
      })

      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

      await insertRollingShow(knex, {
        show_title: 'Stella',
        monitoring_type: 'firstSeasonRolling',
        sonarr_series_id: 1566,
        sonarr_instance_id: 1,
        tvdb_id: '90210',
        current_monitored_season: 1,
      })
      await insertRollingShow(knex, {
        show_title: 'Stella',
        monitoring_type: 'firstSeasonRolling',
        sonarr_series_id: 1566,
        sonarr_instance_id: 1,
        tvdb_id: '90210',
        plex_user_id: 'u_nicole',
        plex_username: 'nicole3876',
        last_watched_season: 3,
        last_watched_episode: 7,
        current_monitored_season: 5,
        last_session_date: yesterday,
      })
      await insertRollingShow(knex, {
        show_title: 'Stella',
        monitoring_type: 'firstSeasonRolling',
        sonarr_series_id: 1566,
        sonarr_instance_id: 1,
        tvdb_id: '90210',
        plex_user_id: 'u_storm',
        plex_username: 'stormshaker',
        last_watched_season: 1,
        last_watched_episode: 3,
        current_monitored_season: 1,
        last_session_date: yesterday,
      })

      const mockGetActiveSessions = vi
        .fn()
        .mockResolvedValue([makeEpisodeSession({ season: 4, episode: 7 })])
      const mockGetShowMetadata = vi
        .fn()
        .mockResolvedValue(makeShowMetadata('90210'))

      app.plexServerService.getActiveSessions = mockGetActiveSessions
      app.plexServerService.getShowMetadata = mockGetShowMetadata

      const mockUpdateSeasonMonitoring = vi.fn().mockResolvedValue(true)
      const mockGetEpisodes = vi
        .fn()
        .mockResolvedValue(makeEpisodesWithFiles([2, 3], 1566))

      const fakeSonarr = {
        getAllSeries: vi.fn().mockResolvedValue([makeSonarrSeries(1566, 5)]),
        getEpisodes: mockGetEpisodes,
        updateSeasonMonitoring: mockUpdateSeasonMonitoring,
        updateEpisodesMonitoring: vi.fn().mockResolvedValue(true),
        deleteEpisodeFiles: vi.fn().mockResolvedValue(true),
        searchSeason: vi.fn().mockResolvedValue(true),
      }

      app.sonarrManager.getAllInstances = vi
        .fn()
        .mockResolvedValue([
          { id: 1, name: 'Test Sonarr', baseUrl: 'http://x', apiKey: 'k' },
        ])
      app.sonarrManager.getSonarrService = vi
        .fn()
        .mockReturnValue(
          fakeSonarr as unknown as ReturnType<
            typeof app.sonarrManager.getSonarrService
          >,
        )

      await app.plexSessionMonitor.monitorSessions()

      const unmonitoredSeasons = mockUpdateSeasonMonitoring.mock.calls
        .filter((call) => call[2] === false)
        .map((call) => call[1])

      expect([...unmonitoredSeasons].sort((a, b) => a - b)).toEqual([3])
    })

    it('should clean seasons when other user is past inactivity cutoff', async () => {
      const knex = getTestDatabase()

      await app.updateConfig({
        plexSessionMonitoring: {
          enabled: true,
          filterUsers: [],
          enableAutoReset: false,
          remainingEpisodes: 2,
          inactivityResetDays: 7,
          autoResetIntervalHours: 24,
          pollingIntervalMinutes: 15,
          enableProgressiveCleanup: true,
        },
      })

      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const longAgo = new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000,
      ).toISOString()

      await insertRollingShow(knex, {
        show_title: 'Stella',
        monitoring_type: 'firstSeasonRolling',
        sonarr_series_id: 1566,
        sonarr_instance_id: 1,
        tvdb_id: '90210',
      })
      await insertRollingShow(knex, {
        show_title: 'Stella',
        monitoring_type: 'firstSeasonRolling',
        sonarr_series_id: 1566,
        sonarr_instance_id: 1,
        tvdb_id: '90210',
        plex_user_id: 'u_nicole',
        plex_username: 'nicole3876',
        last_watched_season: 3,
        last_watched_episode: 7,
        current_monitored_season: 5,
        last_session_date: yesterday,
      })
      await insertRollingShow(knex, {
        show_title: 'Stella',
        monitoring_type: 'firstSeasonRolling',
        sonarr_series_id: 1566,
        sonarr_instance_id: 1,
        tvdb_id: '90210',
        plex_user_id: 'u_storm',
        plex_username: 'stormshaker',
        last_watched_season: 1,
        last_watched_episode: 3,
        current_monitored_season: 1,
        last_session_date: longAgo,
      })

      app.plexServerService.getActiveSessions = vi
        .fn()
        .mockResolvedValue([makeEpisodeSession({ season: 4, episode: 7 })])
      app.plexServerService.getShowMetadata = vi
        .fn()
        .mockResolvedValue(makeShowMetadata('90210'))

      const mockUpdateSeasonMonitoring = vi.fn().mockResolvedValue(true)
      const fakeSonarr = {
        getAllSeries: vi.fn().mockResolvedValue([makeSonarrSeries(1566, 5)]),
        getEpisodes: vi
          .fn()
          .mockResolvedValue(makeEpisodesWithFiles([2, 3], 1566)),
        updateSeasonMonitoring: mockUpdateSeasonMonitoring,
        updateEpisodesMonitoring: vi.fn().mockResolvedValue(true),
        deleteEpisodeFiles: vi.fn().mockResolvedValue(true),
        searchSeason: vi.fn().mockResolvedValue(true),
      }

      app.sonarrManager.getAllInstances = vi
        .fn()
        .mockResolvedValue([
          { id: 1, name: 'Test Sonarr', baseUrl: 'http://x', apiKey: 'k' },
        ])
      app.sonarrManager.getSonarrService = vi
        .fn()
        .mockReturnValue(
          fakeSonarr as unknown as ReturnType<
            typeof app.sonarrManager.getSonarrService
          >,
        )

      await app.plexSessionMonitor.monitorSessions()

      const unmonitoredSeasons = mockUpdateSeasonMonitoring.mock.calls
        .filter((call) => call[2] === false)
        .map((call) => call[1])

      expect([...unmonitoredSeasons].sort((a, b) => a - b)).toEqual([2, 3])
    })

    it('should record progress for triggering user even when cleanup yields no seasons', async () => {
      const knex = getTestDatabase()

      await app.updateConfig({
        plexSessionMonitoring: {
          enabled: true,
          filterUsers: [],
          enableAutoReset: false,
          remainingEpisodes: 2,
          inactivityResetDays: 7,
          autoResetIntervalHours: 24,
          pollingIntervalMinutes: 15,
          enableProgressiveCleanup: true,
        },
      })

      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

      await insertRollingShow(knex, {
        show_title: 'Stella',
        monitoring_type: 'firstSeasonRolling',
        sonarr_series_id: 1566,
        sonarr_instance_id: 1,
        tvdb_id: '90210',
      })
      const nicoleId = await insertRollingShow(knex, {
        show_title: 'Stella',
        monitoring_type: 'firstSeasonRolling',
        sonarr_series_id: 1566,
        sonarr_instance_id: 1,
        tvdb_id: '90210',
        plex_user_id: 'u_nicole',
        plex_username: 'nicole3876',
        last_watched_season: 3,
        last_watched_episode: 5,
        current_monitored_season: 5,
        last_session_date: yesterday,
      })
      await insertRollingShow(knex, {
        show_title: 'Stella',
        monitoring_type: 'firstSeasonRolling',
        sonarr_series_id: 1566,
        sonarr_instance_id: 1,
        tvdb_id: '90210',
        plex_user_id: 'u_storm',
        plex_username: 'stormshaker',
        last_watched_season: 2,
        last_watched_episode: 9,
        current_monitored_season: 2,
        last_session_date: yesterday,
      })

      app.plexServerService.getActiveSessions = vi
        .fn()
        .mockResolvedValue([makeEpisodeSession({ season: 4, episode: 7 })])
      app.plexServerService.getShowMetadata = vi
        .fn()
        .mockResolvedValue(makeShowMetadata('90210'))

      const mockUpdateSeasonMonitoring = vi.fn().mockResolvedValue(true)
      const fakeSonarr = {
        getAllSeries: vi.fn().mockResolvedValue([makeSonarrSeries(1566, 5)]),
        getEpisodes: vi
          .fn()
          .mockResolvedValue(makeEpisodesWithFiles([2, 3], 1566)),
        updateSeasonMonitoring: mockUpdateSeasonMonitoring,
        updateEpisodesMonitoring: vi.fn().mockResolvedValue(true),
        deleteEpisodeFiles: vi.fn().mockResolvedValue(true),
        searchSeason: vi.fn().mockResolvedValue(true),
      }

      app.sonarrManager.getAllInstances = vi
        .fn()
        .mockResolvedValue([
          { id: 1, name: 'Test Sonarr', baseUrl: 'http://x', apiKey: 'k' },
        ])
      app.sonarrManager.getSonarrService = vi
        .fn()
        .mockReturnValue(
          fakeSonarr as unknown as ReturnType<
            typeof app.sonarrManager.getSonarrService
          >,
        )

      await app.plexSessionMonitor.monitorSessions()

      const nicoleRow = await knex('rolling_monitored_shows')
        .where({ id: nicoleId })
        .first()
      expect(nicoleRow.last_watched_season).toBe(4)
      expect(nicoleRow.last_watched_episode).toBe(7)

      const unmonitorCalls = mockUpdateSeasonMonitoring.mock.calls.filter(
        (call) => call[2] === false,
      )
      expect(unmonitorCalls).toEqual([])
    })

    it('should clean middle seasons left unprotected by a gap between two active users', async () => {
      const knex = getTestDatabase()

      await app.updateConfig({
        plexSessionMonitoring: {
          enabled: true,
          filterUsers: [],
          enableAutoReset: false,
          remainingEpisodes: 2,
          inactivityResetDays: 7,
          autoResetIntervalHours: 24,
          pollingIntervalMinutes: 15,
          enableProgressiveCleanup: true,
        },
      })

      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

      await insertRollingShow(knex, {
        show_title: 'Stella',
        monitoring_type: 'firstSeasonRolling',
        sonarr_series_id: 1566,
        sonarr_instance_id: 1,
        tvdb_id: '90210',
      })
      await insertRollingShow(knex, {
        show_title: 'Stella',
        monitoring_type: 'firstSeasonRolling',
        sonarr_series_id: 1566,
        sonarr_instance_id: 1,
        tvdb_id: '90210',
        plex_user_id: 'u_nicole',
        plex_username: 'nicole3876',
        last_watched_season: 5,
        last_watched_episode: 3,
        current_monitored_season: 7,
        last_session_date: yesterday,
      })
      await insertRollingShow(knex, {
        show_title: 'Stella',
        monitoring_type: 'firstSeasonRolling',
        sonarr_series_id: 1566,
        sonarr_instance_id: 1,
        tvdb_id: '90210',
        plex_user_id: 'u_storm',
        plex_username: 'stormshaker',
        last_watched_season: 2,
        last_watched_episode: 4,
        current_monitored_season: 2,
        last_session_date: yesterday,
      })

      app.plexServerService.getActiveSessions = vi
        .fn()
        .mockResolvedValue([makeEpisodeSession({ season: 6, episode: 3 })])
      app.plexServerService.getShowMetadata = vi
        .fn()
        .mockResolvedValue(makeShowMetadata('90210'))

      const mockUpdateSeasonMonitoring = vi.fn().mockResolvedValue(true)
      const fakeSonarr = {
        getAllSeries: vi.fn().mockResolvedValue([makeSonarrSeries(1566, 7)]),
        getEpisodes: vi
          .fn()
          .mockResolvedValue(makeEpisodesWithFiles([2, 3, 4, 5], 1566)),
        updateSeasonMonitoring: mockUpdateSeasonMonitoring,
        updateEpisodesMonitoring: vi.fn().mockResolvedValue(true),
        deleteEpisodeFiles: vi.fn().mockResolvedValue(true),
        searchSeason: vi.fn().mockResolvedValue(true),
      }

      app.sonarrManager.getAllInstances = vi
        .fn()
        .mockResolvedValue([
          { id: 1, name: 'Test Sonarr', baseUrl: 'http://x', apiKey: 'k' },
        ])
      app.sonarrManager.getSonarrService = vi
        .fn()
        .mockReturnValue(
          fakeSonarr as unknown as ReturnType<
            typeof app.sonarrManager.getSonarrService
          >,
        )

      await app.plexSessionMonitor.monitorSessions()

      const unmonitoredSeasons = mockUpdateSeasonMonitoring.mock.calls
        .filter((call) => call[2] === false)
        .map((call) => call[1])

      expect([...unmonitoredSeasons].sort((a, b) => a - b)).toEqual([4, 5])
    })

    it('should not protect seasons when only the master record exists for other users', async () => {
      const knex = getTestDatabase()

      await app.updateConfig({
        plexSessionMonitoring: {
          enabled: true,
          filterUsers: [],
          enableAutoReset: false,
          remainingEpisodes: 2,
          inactivityResetDays: 7,
          autoResetIntervalHours: 24,
          pollingIntervalMinutes: 15,
          enableProgressiveCleanup: true,
        },
      })

      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

      await insertRollingShow(knex, {
        show_title: 'Stella',
        monitoring_type: 'firstSeasonRolling',
        sonarr_series_id: 1566,
        sonarr_instance_id: 1,
        tvdb_id: '90210',
        last_watched_season: 1,
        current_monitored_season: 1,
      })
      await insertRollingShow(knex, {
        show_title: 'Stella',
        monitoring_type: 'firstSeasonRolling',
        sonarr_series_id: 1566,
        sonarr_instance_id: 1,
        tvdb_id: '90210',
        plex_user_id: 'u_nicole',
        plex_username: 'nicole3876',
        last_watched_season: 3,
        last_watched_episode: 7,
        current_monitored_season: 5,
        last_session_date: yesterday,
      })

      app.plexServerService.getActiveSessions = vi
        .fn()
        .mockResolvedValue([makeEpisodeSession({ season: 4, episode: 7 })])
      app.plexServerService.getShowMetadata = vi
        .fn()
        .mockResolvedValue(makeShowMetadata('90210'))

      const mockUpdateSeasonMonitoring = vi.fn().mockResolvedValue(true)
      const fakeSonarr = {
        getAllSeries: vi.fn().mockResolvedValue([makeSonarrSeries(1566, 5)]),
        getEpisodes: vi
          .fn()
          .mockResolvedValue(makeEpisodesWithFiles([2, 3], 1566)),
        updateSeasonMonitoring: mockUpdateSeasonMonitoring,
        updateEpisodesMonitoring: vi.fn().mockResolvedValue(true),
        deleteEpisodeFiles: vi.fn().mockResolvedValue(true),
        searchSeason: vi.fn().mockResolvedValue(true),
      }

      app.sonarrManager.getAllInstances = vi
        .fn()
        .mockResolvedValue([
          { id: 1, name: 'Test Sonarr', baseUrl: 'http://x', apiKey: 'k' },
        ])
      app.sonarrManager.getSonarrService = vi
        .fn()
        .mockReturnValue(
          fakeSonarr as unknown as ReturnType<
            typeof app.sonarrManager.getSonarrService
          >,
        )

      await app.plexSessionMonitor.monitorSessions()

      const unmonitoredSeasons = mockUpdateSeasonMonitoring.mock.calls
        .filter((call) => call[2] === false)
        .map((call) => call[1])

      expect([...unmonitoredSeasons].sort((a, b) => a - b)).toEqual([2, 3])
    })
  })

  describe('pilotRolling Season 1 reset', () => {
    it('should not reset Season 1 to pilot when another user is still on Season 1', async () => {
      const knex = getTestDatabase()

      await app.updateConfig({
        plexSessionMonitoring: {
          enabled: true,
          filterUsers: [],
          enableAutoReset: false,
          remainingEpisodes: 2,
          inactivityResetDays: 7,
          autoResetIntervalHours: 24,
          pollingIntervalMinutes: 15,
          enableProgressiveCleanup: true,
        },
      })

      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

      await insertRollingShow(knex, {
        show_title: 'Stella',
        monitoring_type: 'pilotRolling',
        sonarr_series_id: 1566,
        sonarr_instance_id: 1,
        tvdb_id: '90210',
      })
      await insertRollingShow(knex, {
        show_title: 'Stella',
        monitoring_type: 'pilotRolling',
        sonarr_series_id: 1566,
        sonarr_instance_id: 1,
        tvdb_id: '90210',
        plex_user_id: 'u_nicole',
        plex_username: 'nicole3876',
        last_watched_season: 3,
        last_watched_episode: 7,
        current_monitored_season: 5,
        last_session_date: yesterday,
      })
      await insertRollingShow(knex, {
        show_title: 'Stella',
        monitoring_type: 'pilotRolling',
        sonarr_series_id: 1566,
        sonarr_instance_id: 1,
        tvdb_id: '90210',
        plex_user_id: 'u_storm',
        plex_username: 'stormshaker',
        last_watched_season: 1,
        last_watched_episode: 3,
        current_monitored_season: 1,
        last_session_date: yesterday,
      })

      app.plexServerService.getActiveSessions = vi
        .fn()
        .mockResolvedValue([makeEpisodeSession({ season: 4, episode: 7 })])
      app.plexServerService.getShowMetadata = vi
        .fn()
        .mockResolvedValue(makeShowMetadata('90210'))

      const mockUpdateEpisodesMonitoring = vi.fn().mockResolvedValue(true)
      const mockDeleteEpisodeFiles = vi.fn().mockResolvedValue(true)
      const fakeSonarr = {
        getAllSeries: vi.fn().mockResolvedValue([makeSonarrSeries(1566, 5)]),
        getEpisodes: vi
          .fn()
          .mockResolvedValue(makeEpisodesWithFiles([1, 2, 3], 1566)),
        updateSeasonMonitoring: vi.fn().mockResolvedValue(true),
        updateEpisodesMonitoring: mockUpdateEpisodesMonitoring,
        deleteEpisodeFiles: mockDeleteEpisodeFiles,
        searchSeason: vi.fn().mockResolvedValue(true),
      }

      app.sonarrManager.getAllInstances = vi
        .fn()
        .mockResolvedValue([
          { id: 1, name: 'Test Sonarr', baseUrl: 'http://x', apiKey: 'k' },
        ])
      app.sonarrManager.getSonarrService = vi
        .fn()
        .mockReturnValue(
          fakeSonarr as unknown as ReturnType<
            typeof app.sonarrManager.getSonarrService
          >,
        )

      await app.plexSessionMonitor.monitorSessions()

      const deletedFileIds = mockDeleteEpisodeFiles.mock.calls.flatMap(
        (call) => call[0] as number[],
      )
      const season1FileIds = deletedFileIds.filter(
        (id) => id >= 1000 && id < 2000,
      )
      expect(season1FileIds).toEqual([])

      const unmonitoredEpisodeIds = mockUpdateEpisodesMonitoring.mock.calls
        .flatMap((call) => call[0] as Array<{ id: number; monitored: boolean }>)
        .filter((ep) => ep.monitored === false && ep.id >= 100 && ep.id < 200)
        .map((ep) => ep.id)
      expect(unmonitoredEpisodeIds).toEqual([])
    })

    it('should reset Season 1 to pilot when no active user is on Season 1', async () => {
      const knex = getTestDatabase()

      await app.updateConfig({
        plexSessionMonitoring: {
          enabled: true,
          filterUsers: [],
          enableAutoReset: false,
          remainingEpisodes: 2,
          inactivityResetDays: 7,
          autoResetIntervalHours: 24,
          pollingIntervalMinutes: 15,
          enableProgressiveCleanup: true,
        },
      })

      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

      await insertRollingShow(knex, {
        show_title: 'Stella',
        monitoring_type: 'pilotRolling',
        sonarr_series_id: 1566,
        sonarr_instance_id: 1,
        tvdb_id: '90210',
      })
      await insertRollingShow(knex, {
        show_title: 'Stella',
        monitoring_type: 'pilotRolling',
        sonarr_series_id: 1566,
        sonarr_instance_id: 1,
        tvdb_id: '90210',
        plex_user_id: 'u_nicole',
        plex_username: 'nicole3876',
        last_watched_season: 3,
        last_watched_episode: 7,
        current_monitored_season: 5,
        last_session_date: yesterday,
      })

      app.plexServerService.getActiveSessions = vi
        .fn()
        .mockResolvedValue([makeEpisodeSession({ season: 4, episode: 7 })])
      app.plexServerService.getShowMetadata = vi
        .fn()
        .mockResolvedValue(makeShowMetadata('90210'))

      const mockUpdateEpisodesMonitoring = vi.fn().mockResolvedValue(true)
      const mockDeleteEpisodeFiles = vi.fn().mockResolvedValue(true)
      const fakeSonarr = {
        getAllSeries: vi.fn().mockResolvedValue([makeSonarrSeries(1566, 5)]),
        getEpisodes: vi
          .fn()
          .mockResolvedValue(makeEpisodesWithFiles([1, 2, 3], 1566)),
        updateSeasonMonitoring: vi.fn().mockResolvedValue(true),
        updateEpisodesMonitoring: mockUpdateEpisodesMonitoring,
        deleteEpisodeFiles: mockDeleteEpisodeFiles,
        searchSeason: vi.fn().mockResolvedValue(true),
      }

      app.sonarrManager.getAllInstances = vi
        .fn()
        .mockResolvedValue([
          { id: 1, name: 'Test Sonarr', baseUrl: 'http://x', apiKey: 'k' },
        ])
      app.sonarrManager.getSonarrService = vi
        .fn()
        .mockReturnValue(
          fakeSonarr as unknown as ReturnType<
            typeof app.sonarrManager.getSonarrService
          >,
        )

      await app.plexSessionMonitor.monitorSessions()

      const deletedFileIds = mockDeleteEpisodeFiles.mock.calls.flatMap(
        (call) => call[0] as number[],
      )
      const season1FilesDeleted = deletedFileIds
        .filter((id) => id >= 1000 && id < 2000)
        .sort((a, b) => a - b)
      expect(season1FilesDeleted).toEqual([
        1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010,
      ])

      const unmonitoredS1 = mockUpdateEpisodesMonitoring.mock.calls
        .flatMap((call) => call[0] as Array<{ id: number; monitored: boolean }>)
        .filter((ep) => ep.monitored === false && ep.id >= 100 && ep.id < 200)
        .map((ep) => ep.id)
        .sort((a, b) => a - b)
      expect(unmonitoredS1).toEqual([
        102, 103, 104, 105, 106, 107, 108, 109, 110,
      ])
    })
  })

  describe('allSeasonPilotRolling', () => {
    it('should preserve pilot episodes while cleaning earlier seasons', async () => {
      const knex = getTestDatabase()

      await app.updateConfig({
        plexSessionMonitoring: {
          enabled: true,
          filterUsers: [],
          enableAutoReset: false,
          remainingEpisodes: 2,
          inactivityResetDays: 7,
          autoResetIntervalHours: 24,
          pollingIntervalMinutes: 15,
          enableProgressiveCleanup: true,
        },
      })

      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

      await insertRollingShow(knex, {
        show_title: 'Stella',
        monitoring_type: 'allSeasonPilotRolling',
        sonarr_series_id: 1566,
        sonarr_instance_id: 1,
        tvdb_id: '90210',
      })
      await insertRollingShow(knex, {
        show_title: 'Stella',
        monitoring_type: 'allSeasonPilotRolling',
        sonarr_series_id: 1566,
        sonarr_instance_id: 1,
        tvdb_id: '90210',
        plex_user_id: 'u_nicole',
        plex_username: 'nicole3876',
        last_watched_season: 3,
        last_watched_episode: 7,
        current_monitored_season: 5,
        last_session_date: yesterday,
      })

      app.plexServerService.getActiveSessions = vi
        .fn()
        .mockResolvedValue([makeEpisodeSession({ season: 4, episode: 7 })])
      app.plexServerService.getShowMetadata = vi
        .fn()
        .mockResolvedValue(makeShowMetadata('90210'))

      const mockDeleteEpisodeFiles = vi.fn().mockResolvedValue(true)
      const mockUpdateEpisodesMonitoring = vi.fn().mockResolvedValue(true)
      const fakeSonarr = {
        getAllSeries: vi.fn().mockResolvedValue([makeSonarrSeries(1566, 5)]),
        getEpisodes: vi
          .fn()
          .mockResolvedValue(makeEpisodesWithFiles([1, 2, 3], 1566)),
        updateSeasonMonitoring: vi.fn().mockResolvedValue(true),
        updateEpisodesMonitoring: mockUpdateEpisodesMonitoring,
        deleteEpisodeFiles: mockDeleteEpisodeFiles,
        searchSeason: vi.fn().mockResolvedValue(true),
      }

      app.sonarrManager.getAllInstances = vi
        .fn()
        .mockResolvedValue([
          { id: 1, name: 'Test Sonarr', baseUrl: 'http://x', apiKey: 'k' },
        ])
      app.sonarrManager.getSonarrService = vi
        .fn()
        .mockReturnValue(
          fakeSonarr as unknown as ReturnType<
            typeof app.sonarrManager.getSonarrService
          >,
        )

      await app.plexSessionMonitor.monitorSessions()

      const deletedFileIds = [
        ...mockDeleteEpisodeFiles.mock.calls.flatMap(
          (call) => call[0] as number[],
        ),
      ].sort((a, b) => a - b)

      // E02-E10 of S1, S2, S3 - pilots (1001, 2001, 3001) preserved.
      expect(deletedFileIds).toEqual([
        1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010, 2002, 2003, 2004,
        2005, 2006, 2007, 2008, 2009, 2010, 3002, 3003, 3004, 3005, 3006, 3007,
        3008, 3009, 3010,
      ])

      const unmonitoredPilots = mockUpdateEpisodesMonitoring.mock.calls
        .flatMap((call) => call[0] as Array<{ id: number; monitored: boolean }>)
        .filter(
          (ep) =>
            ep.monitored === false &&
            (ep.id === 101 || ep.id === 201 || ep.id === 301),
        )
      expect(unmonitoredPilots).toEqual([])
    })

    it('should leave a season intact when another user still needs it', async () => {
      const knex = getTestDatabase()

      await app.updateConfig({
        plexSessionMonitoring: {
          enabled: true,
          filterUsers: [],
          enableAutoReset: false,
          remainingEpisodes: 2,
          inactivityResetDays: 7,
          autoResetIntervalHours: 24,
          pollingIntervalMinutes: 15,
          enableProgressiveCleanup: true,
        },
      })

      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

      await insertRollingShow(knex, {
        show_title: 'Stella',
        monitoring_type: 'allSeasonPilotRolling',
        sonarr_series_id: 1566,
        sonarr_instance_id: 1,
        tvdb_id: '90210',
      })
      await insertRollingShow(knex, {
        show_title: 'Stella',
        monitoring_type: 'allSeasonPilotRolling',
        sonarr_series_id: 1566,
        sonarr_instance_id: 1,
        tvdb_id: '90210',
        plex_user_id: 'u_nicole',
        plex_username: 'nicole3876',
        last_watched_season: 3,
        last_watched_episode: 7,
        current_monitored_season: 5,
        last_session_date: yesterday,
      })
      await insertRollingShow(knex, {
        show_title: 'Stella',
        monitoring_type: 'allSeasonPilotRolling',
        sonarr_series_id: 1566,
        sonarr_instance_id: 1,
        tvdb_id: '90210',
        plex_user_id: 'u_storm',
        plex_username: 'stormshaker',
        last_watched_season: 2,
        last_watched_episode: 4,
        current_monitored_season: 2,
        last_session_date: yesterday,
      })

      app.plexServerService.getActiveSessions = vi
        .fn()
        .mockResolvedValue([makeEpisodeSession({ season: 4, episode: 7 })])
      app.plexServerService.getShowMetadata = vi
        .fn()
        .mockResolvedValue(makeShowMetadata('90210'))

      const mockDeleteEpisodeFiles = vi.fn().mockResolvedValue(true)
      const fakeSonarr = {
        getAllSeries: vi.fn().mockResolvedValue([makeSonarrSeries(1566, 5)]),
        getEpisodes: vi
          .fn()
          .mockResolvedValue(makeEpisodesWithFiles([1, 2, 3], 1566)),
        updateSeasonMonitoring: vi.fn().mockResolvedValue(true),
        updateEpisodesMonitoring: vi.fn().mockResolvedValue(true),
        deleteEpisodeFiles: mockDeleteEpisodeFiles,
        searchSeason: vi.fn().mockResolvedValue(true),
      }

      app.sonarrManager.getAllInstances = vi
        .fn()
        .mockResolvedValue([
          { id: 1, name: 'Test Sonarr', baseUrl: 'http://x', apiKey: 'k' },
        ])
      app.sonarrManager.getSonarrService = vi
        .fn()
        .mockReturnValue(
          fakeSonarr as unknown as ReturnType<
            typeof app.sonarrManager.getSonarrService
          >,
        )

      await app.plexSessionMonitor.monitorSessions()

      const deletedFileIds = [
        ...mockDeleteEpisodeFiles.mock.calls.flatMap(
          (call) => call[0] as number[],
        ),
      ].sort((a, b) => a - b)

      // stormshaker on S2 protects S2-S3; only S1 non-pilots are cleanable.
      expect(deletedFileIds).toEqual([
        1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010,
      ])
    })
  })

  describe('Cleanup trigger gating', () => {
    it('should not call Sonarr cleanup when the user has not advanced into a new season', async () => {
      const knex = getTestDatabase()

      await app.updateConfig({
        plexSessionMonitoring: {
          enabled: true,
          filterUsers: [],
          enableAutoReset: false,
          remainingEpisodes: 2,
          inactivityResetDays: 7,
          autoResetIntervalHours: 24,
          pollingIntervalMinutes: 15,
          enableProgressiveCleanup: true,
        },
      })

      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

      await insertRollingShow(knex, {
        show_title: 'Stella',
        monitoring_type: 'firstSeasonRolling',
        sonarr_series_id: 1566,
        sonarr_instance_id: 1,
        tvdb_id: '90210',
      })
      await insertRollingShow(knex, {
        show_title: 'Stella',
        monitoring_type: 'firstSeasonRolling',
        sonarr_series_id: 1566,
        sonarr_instance_id: 1,
        tvdb_id: '90210',
        plex_user_id: 'u_nicole',
        plex_username: 'nicole3876',
        last_watched_season: 4,
        last_watched_episode: 7,
        current_monitored_season: 5,
        last_session_date: yesterday,
      })

      app.plexServerService.getActiveSessions = vi
        .fn()
        .mockResolvedValue([makeEpisodeSession({ season: 4, episode: 7 })])
      app.plexServerService.getShowMetadata = vi
        .fn()
        .mockResolvedValue(makeShowMetadata('90210'))

      const mockUpdateSeasonMonitoring = vi.fn().mockResolvedValue(true)
      const mockDeleteEpisodeFiles = vi.fn().mockResolvedValue(true)
      const mockGetEpisodes = vi
        .fn()
        .mockResolvedValue(makeEpisodesWithFiles([2, 3], 1566))

      const mockGetAllSeries = vi
        .fn()
        .mockResolvedValue([makeSonarrSeries(1566, 5)])
      const fakeSonarr = {
        getAllSeries: mockGetAllSeries,
        getEpisodes: mockGetEpisodes,
        updateSeasonMonitoring: mockUpdateSeasonMonitoring,
        updateEpisodesMonitoring: vi.fn().mockResolvedValue(true),
        deleteEpisodeFiles: mockDeleteEpisodeFiles,
        searchSeason: vi.fn().mockResolvedValue(true),
      }

      app.sonarrManager.getAllInstances = vi
        .fn()
        .mockResolvedValue([
          { id: 1, name: 'Test Sonarr', baseUrl: 'http://x', apiKey: 'k' },
        ])
      app.sonarrManager.getSonarrService = vi
        .fn()
        .mockReturnValue(
          fakeSonarr as unknown as ReturnType<
            typeof app.sonarrManager.getSonarrService
          >,
        )

      await app.plexSessionMonitor.monitorSessions()

      expect(mockUpdateSeasonMonitoring).not.toHaveBeenCalled()
      expect(mockDeleteEpisodeFiles).not.toHaveBeenCalled()
      expect(mockGetAllSeries).not.toHaveBeenCalled()
      expect(mockGetEpisodes).not.toHaveBeenCalled()
    })

    it('should still run the expansion check when the user advances to a new episode within the same season', async () => {
      const knex = getTestDatabase()

      await app.updateConfig({
        plexSessionMonitoring: {
          enabled: true,
          filterUsers: [],
          enableAutoReset: false,
          remainingEpisodes: 2,
          inactivityResetDays: 7,
          autoResetIntervalHours: 24,
          pollingIntervalMinutes: 15,
          enableProgressiveCleanup: true,
        },
      })

      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

      await insertRollingShow(knex, {
        show_title: 'Stella',
        monitoring_type: 'firstSeasonRolling',
        sonarr_series_id: 1566,
        sonarr_instance_id: 1,
        tvdb_id: '90210',
      })
      await insertRollingShow(knex, {
        show_title: 'Stella',
        monitoring_type: 'firstSeasonRolling',
        sonarr_series_id: 1566,
        sonarr_instance_id: 1,
        tvdb_id: '90210',
        plex_user_id: 'u_nicole',
        plex_username: 'nicole3876',
        last_watched_season: 4,
        last_watched_episode: 6,
        current_monitored_season: 5,
        last_session_date: yesterday,
      })

      app.plexServerService.getActiveSessions = vi
        .fn()
        .mockResolvedValue([makeEpisodeSession({ season: 4, episode: 7 })])
      app.plexServerService.getShowMetadata = vi
        .fn()
        .mockResolvedValue(makeShowMetadata('90210'))

      const mockGetAllSeries = vi
        .fn()
        .mockResolvedValue([makeSonarrSeries(1566, 5)])
      const fakeSonarr = {
        getAllSeries: mockGetAllSeries,
        getEpisodes: vi
          .fn()
          .mockResolvedValue(makeEpisodesWithFiles([2, 3], 1566)),
        updateSeasonMonitoring: vi.fn().mockResolvedValue(true),
        updateEpisodesMonitoring: vi.fn().mockResolvedValue(true),
        deleteEpisodeFiles: vi.fn().mockResolvedValue(true),
        searchSeason: vi.fn().mockResolvedValue(true),
      }

      app.sonarrManager.getAllInstances = vi
        .fn()
        .mockResolvedValue([
          { id: 1, name: 'Test Sonarr', baseUrl: 'http://x', apiKey: 'k' },
        ])
      app.sonarrManager.getSonarrService = vi
        .fn()
        .mockReturnValue(
          fakeSonarr as unknown as ReturnType<
            typeof app.sonarrManager.getSonarrService
          >,
        )

      await app.plexSessionMonitor.monitorSessions()

      // Without this the end-of-season expansion would never trigger.
      expect(mockGetAllSeries).toHaveBeenCalled()
    })

    it('should fire cleanup exactly once when the same session is processed twice without progress', async () => {
      const knex = getTestDatabase()

      await app.updateConfig({
        plexSessionMonitoring: {
          enabled: true,
          filterUsers: [],
          enableAutoReset: false,
          remainingEpisodes: 2,
          inactivityResetDays: 7,
          autoResetIntervalHours: 24,
          pollingIntervalMinutes: 15,
          enableProgressiveCleanup: true,
        },
      })

      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

      await insertRollingShow(knex, {
        show_title: 'Stella',
        monitoring_type: 'firstSeasonRolling',
        sonarr_series_id: 1566,
        sonarr_instance_id: 1,
        tvdb_id: '90210',
      })
      await insertRollingShow(knex, {
        show_title: 'Stella',
        monitoring_type: 'firstSeasonRolling',
        sonarr_series_id: 1566,
        sonarr_instance_id: 1,
        tvdb_id: '90210',
        plex_user_id: 'u_nicole',
        plex_username: 'nicole3876',
        last_watched_season: 3,
        last_watched_episode: 7,
        current_monitored_season: 5,
        last_session_date: yesterday,
      })

      app.plexServerService.getActiveSessions = vi
        .fn()
        .mockResolvedValue([makeEpisodeSession({ season: 4, episode: 7 })])
      app.plexServerService.getShowMetadata = vi
        .fn()
        .mockResolvedValue(makeShowMetadata('90210'))

      const mockUpdateSeasonMonitoring = vi.fn().mockResolvedValue(true)
      const fakeSonarr = {
        getAllSeries: vi.fn().mockResolvedValue([makeSonarrSeries(1566, 5)]),
        getEpisodes: vi
          .fn()
          .mockResolvedValue(makeEpisodesWithFiles([2, 3], 1566)),
        updateSeasonMonitoring: mockUpdateSeasonMonitoring,
        updateEpisodesMonitoring: vi.fn().mockResolvedValue(true),
        deleteEpisodeFiles: vi.fn().mockResolvedValue(true),
        searchSeason: vi.fn().mockResolvedValue(true),
      }

      app.sonarrManager.getAllInstances = vi
        .fn()
        .mockResolvedValue([
          { id: 1, name: 'Test Sonarr', baseUrl: 'http://x', apiKey: 'k' },
        ])
      app.sonarrManager.getSonarrService = vi
        .fn()
        .mockReturnValue(
          fakeSonarr as unknown as ReturnType<
            typeof app.sonarrManager.getSonarrService
          >,
        )

      await app.plexSessionMonitor.monitorSessions()
      const callsAfterFirst = mockUpdateSeasonMonitoring.mock.calls.length
      await app.plexSessionMonitor.monitorSessions()
      const callsAfterSecond = mockUpdateSeasonMonitoring.mock.calls.length

      // First run crosses 3 to 4 and cleans; second run sees prior at 4 and no-ops.
      expect(callsAfterFirst).toBeGreaterThan(0)
      expect(callsAfterSecond).toBe(callsAfterFirst)

      const unmonitoredSeasons = mockUpdateSeasonMonitoring.mock.calls
        .filter((call) => call[2] === false)
        .map((call) => call[1])
        .sort((a, b) => a - b)
      expect(unmonitoredSeasons).toEqual([2, 3])
    })

    it('should still attempt pilot expansion on repeated E01 events so transient failures retry', async () => {
      const knex = getTestDatabase()

      await app.updateConfig({
        plexSessionMonitoring: {
          enabled: true,
          filterUsers: [],
          enableAutoReset: false,
          remainingEpisodes: 2,
          inactivityResetDays: 7,
          autoResetIntervalHours: 24,
          pollingIntervalMinutes: 15,
          enableProgressiveCleanup: true,
        },
      })

      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

      await insertRollingShow(knex, {
        show_title: 'Stella',
        monitoring_type: 'pilotRolling',
        sonarr_series_id: 1566,
        sonarr_instance_id: 1,
        tvdb_id: '90210',
      })
      await insertRollingShow(knex, {
        show_title: 'Stella',
        monitoring_type: 'pilotRolling',
        sonarr_series_id: 1566,
        sonarr_instance_id: 1,
        tvdb_id: '90210',
        plex_user_id: 'u_nicole',
        plex_username: 'nicole3876',
        last_watched_season: 1,
        last_watched_episode: 1,
        current_monitored_season: 1,
        last_session_date: yesterday,
      })

      app.plexServerService.getActiveSessions = vi
        .fn()
        .mockResolvedValue([makeEpisodeSession({ season: 1, episode: 1 })])
      app.plexServerService.getShowMetadata = vi
        .fn()
        .mockResolvedValue(makeShowMetadata('90210'))

      // Episodes for S1 with E02-E10 unmonitored so the expand path runs each call.
      const s1Episodes: SonarrEpisode[] = []
      for (let n = 1; n <= 10; n++) {
        s1Episodes.push({
          id: 100 + n,
          seriesId: 1566,
          episodeFileId: 1000 + n,
          seasonNumber: 1,
          episodeNumber: n,
          title: `S01E${n}`,
          hasFile: n === 1,
          monitored: n === 1,
          unverifiedSceneNumbering: false,
          grabbed: false,
        })
      }
      const mockGetEpisodes = vi.fn().mockResolvedValue(s1Episodes)
      const mockUpdateSeasonMonitoring = vi.fn().mockResolvedValue(true)
      const fakeSonarr = {
        getAllSeries: vi.fn().mockResolvedValue([makeSonarrSeries(1566, 5)]),
        getEpisodes: mockGetEpisodes,
        updateSeasonMonitoring: mockUpdateSeasonMonitoring,
        updateEpisodesMonitoring: vi.fn().mockResolvedValue(true),
        deleteEpisodeFiles: vi.fn().mockResolvedValue(true),
        searchSeason: vi.fn().mockResolvedValue(true),
      }

      app.sonarrManager.getAllInstances = vi
        .fn()
        .mockResolvedValue([
          { id: 1, name: 'Test Sonarr', baseUrl: 'http://x', apiKey: 'k' },
        ])
      app.sonarrManager.getSonarrService = vi
        .fn()
        .mockReturnValue(
          fakeSonarr as unknown as ReturnType<
            typeof app.sonarrManager.getSonarrService
          >,
        )

      // Prior position already matches the session - positionUnchanged is true.
      // Pilot expansion must still fire so a previously-failed expansion retries.
      await app.plexSessionMonitor.monitorSessions()

      expect(mockGetEpisodes).toHaveBeenCalled()
      expect(mockUpdateSeasonMonitoring).toHaveBeenCalledWith(1566, 1, true)
    })
  })

  describe('Multi-instance fan-out (synced 1080p + 4K)', () => {
    it('expands and searches every enrolled instance, not just the first', async () => {
      const knex = getTestDatabase()

      await app.updateConfig({
        plexSessionMonitoring: {
          enabled: true,
          filterUsers: [],
          enableAutoReset: false,
          remainingEpisodes: 2,
          inactivityResetDays: 7,
          autoResetIntervalHours: 24,
          pollingIntervalMinutes: 15,
          enableProgressiveCleanup: false,
        },
      })

      // Second Sonarr instance (the 4K one) to satisfy the FK on the rolling row.
      await knex('sonarr_instances').insert({
        id: 2,
        name: '4K Sonarr',
        base_url: 'http://test-sonarr-4k:8989',
        api_key: 'test_sonarr_4k_api_key_1234567890abcdef',
        quality_profile: '1',
        root_folder: '/data/shows-4k',
        bypass_ignored: false,
        season_monitoring: 'firstSeasonRolling',
        monitor_new_items: 'all',
        search_on_add: true,
        tags: JSON.stringify([]),
        is_default: false,
        is_enabled: true,
        synced_instances: JSON.stringify([]),
        series_type: 'standard',
        create_season_folders: false,
      })

      // Same show synced to two Sonarr instances: one master row per instance,
      // sharing the TVDB ID but with a distinct series ID.
      await insertRollingShow(knex, {
        show_title: 'Stella',
        monitoring_type: 'firstSeasonRolling',
        sonarr_series_id: 1566,
        sonarr_instance_id: 1,
        tvdb_id: '90210',
      })
      await insertRollingShow(knex, {
        show_title: 'Stella',
        monitoring_type: 'firstSeasonRolling',
        sonarr_series_id: 9999,
        sonarr_instance_id: 2,
        tvdb_id: '90210',
      })

      app.plexServerService.getActiveSessions = vi
        .fn()
        .mockResolvedValue([makeEpisodeSession({ season: 1, episode: 15 })])
      app.plexServerService.getShowMetadata = vi
        .fn()
        .mockResolvedValue(makeShowMetadata('90210'))

      const makeFakeSonarr = (seriesId: number) => ({
        getAllSeries: vi
          .fn()
          .mockResolvedValue([makeSonarrSeries(seriesId, 2)]),
        getEpisodes: vi
          .fn()
          .mockResolvedValue(makeEpisodesSeason2Unmonitored(seriesId)),
        updateSeasonMonitoring: vi.fn().mockResolvedValue(true),
        updateEpisodesMonitoring: vi.fn().mockResolvedValue(true),
        deleteEpisodeFiles: vi.fn().mockResolvedValue(true),
        searchSeason: vi.fn().mockResolvedValue(true),
      })

      const sonarrByInstance = new Map([
        [1, makeFakeSonarr(1566)],
        [2, makeFakeSonarr(9999)],
      ])

      app.sonarrManager.getAllInstances = vi.fn().mockResolvedValue([
        { id: 1, name: '1080p', baseUrl: 'http://x', apiKey: 'k' },
        { id: 2, name: '4K', baseUrl: 'http://y', apiKey: 'k' },
      ])
      app.sonarrManager.getSonarrService = vi
        .fn()
        .mockImplementation(
          (id: number) =>
            sonarrByInstance.get(id) as unknown as ReturnType<
              typeof app.sonarrManager.getSonarrService
            >,
        )

      const result = await app.plexSessionMonitor.monitorSessions()

      expect(result.triggeredSearches).toBe(2)
      expect(sonarrByInstance.get(1)?.searchSeason).toHaveBeenCalledWith(
        1566,
        2,
      )
      expect(sonarrByInstance.get(2)?.searchSeason).toHaveBeenCalledWith(
        9999,
        2,
      )
    })
  })
})

function makeEpisodeSession({
  season,
  episode,
}: {
  season: number
  episode: number
}): PlexSession {
  return {
    type: 'episode',
    sessionKey: 'sess-nicole',
    ratingKey: '106942',
    key: '/library/metadata/106942',
    guid: 'plex://episode/abc',
    title: 'Episode',
    parentRatingKey: '106941',
    parentKey: '/library/metadata/106941',
    parentIndex: season,
    parentTitle: `Season ${season}`,
    parentGuid: 'plex://season/abc',
    grandparentRatingKey: '106940',
    grandparentKey: '/library/metadata/106940',
    grandparentTitle: 'Stella',
    grandparentGuid: 'plex://show/abc',
    index: episode,
    viewOffset: 0,
    duration: 1_200_000,
    User: { id: 'u_nicole', title: 'nicole3876' },
    Session: { id: 'session', bandwidth: 0, location: 'lan' },
    librarySectionTitle: 'TV Shows',
    librarySectionID: '2',
  }
}

function makeShowMetadata(tvdbId: string) {
  return {
    MediaContainer: {
      Metadata: [
        {
          ratingKey: '106940',
          guid: 'plex://show/abc',
          Guid: [{ id: `tvdb://${tvdbId}` }, { id: 'imdb://tt12345' }],
        },
      ],
    },
  }
}

function makeSonarrSeries(
  seriesId: number,
  totalSeasons: number,
): SonarrSeries {
  const seasons = []
  for (let n = 1; n <= totalSeasons; n++) {
    seasons.push({
      seasonNumber: n,
      monitored: true,
      statistics: { totalEpisodeCount: 16 },
    })
  }
  return {
    title: 'Stella',
    tvdbId: 90210,
    id: seriesId,
    seasons,
  } as unknown as SonarrSeries
}

// Season 1 fully monitored with files, season 2 present but unmonitored - the
// state that lets expandMonitoringToNextSeason fire (it skips when the next
// season has no unmonitored episodes).
function makeEpisodesSeason2Unmonitored(seriesId: number): SonarrEpisode[] {
  const episodes: SonarrEpisode[] = []
  for (let n = 1; n <= 16; n++) {
    episodes.push({
      id: 100 + n,
      seriesId,
      episodeFileId: 1000 + n,
      seasonNumber: 1,
      episodeNumber: n,
      title: `S1E${n}`,
      hasFile: true,
      monitored: true,
      unverifiedSceneNumbering: false,
      grabbed: false,
    })
  }
  for (let n = 1; n <= 16; n++) {
    episodes.push({
      id: 200 + n,
      seriesId,
      episodeFileId: 0,
      seasonNumber: 2,
      episodeNumber: n,
      title: `S2E${n}`,
      hasFile: false,
      monitored: false,
      unverifiedSceneNumbering: false,
      grabbed: false,
    })
  }
  return episodes
}

// Builds episodes for the given seasons with files. Episode IDs are
// seasonNumber*100 + episodeNumber (e.g. S2E3 = 203). File IDs are
// seasonNumber*1000 + episodeNumber (e.g. S2E3 = 2003). E01 of each
// season is the pilot, E02-E10 are the rest.
function makeEpisodesWithFiles(
  seasons: number[],
  seriesId: number,
): SonarrEpisode[] {
  const episodes: SonarrEpisode[] = []
  for (const seasonNumber of seasons) {
    for (let n = 1; n <= 10; n++) {
      episodes.push({
        id: seasonNumber * 100 + n,
        seriesId,
        episodeFileId: seasonNumber * 1000 + n,
        seasonNumber,
        episodeNumber: n,
        title: `S${seasonNumber}E${n}`,
        hasFile: true,
        monitored: true,
        unverifiedSceneNumbering: false,
        grabbed: false,
      })
    }
  }
  return episodes
}
