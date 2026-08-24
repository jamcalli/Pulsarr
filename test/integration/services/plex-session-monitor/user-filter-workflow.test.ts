/**
 * Integration tests for session monitoring user filtering
 *
 * Exercises monitorSessions end-to-end with real Fastify and real database.
 * The filterUsers config stores Pulsarr user ids (what the UI multi-select
 * saves), while Plex sessions carry the viewer's Plex account id and display
 * title - these tests pin the resolution between the two identity spaces and
 * the interaction between filtering and the position-based trigger dedup.
 */

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
import { SEED_USERS } from '../../../helpers/seeds/users.js'
import {
  makeEpisodeSession,
  makeEpisodesSeason2Unmonitored,
  makeFakeSonarr,
  makeShowMetadata,
  makeSonarrSeries,
  sessionMonitoringConfig,
} from '../../../helpers/session-monitor-fixtures.js'

describe('Session Monitoring → User Filter Integration', () => {
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

  async function setFilterUsers(filterUsers: string[]) {
    await app.updateConfig({
      plexSessionMonitoring: sessionMonitoringConfig({
        filterUsers,
        enableProgressiveCleanup: false,
      }),
    })
  }

  function stubBoundaries(session: PlexSession) {
    app.plexServerService.getActiveSessions = vi
      .fn()
      .mockResolvedValue([session])
    app.plexServerService.getShowMetadata = vi
      .fn()
      .mockResolvedValue(makeShowMetadata('90210'))

    const fakeSonarr = makeFakeSonarr({
      getSeriesById: vi.fn().mockResolvedValue(makeSonarrSeries(1566, 2)),
      getEpisodes: vi
        .fn()
        .mockResolvedValue(makeEpisodesSeason2Unmonitored(1566)),
    })

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

    return fakeSonarr
  }

  async function insertMasterShow() {
    await insertRollingShow(getTestDatabase(), {
      show_title: 'Stella',
      monitoring_type: 'firstSeasonRolling',
      sonarr_series_id: 1566,
      sonarr_instance_id: 1,
      tvdb_id: '90210',
      current_monitored_season: 1,
    })
  }

  it('resolves configured Pulsarr user ids to the Plex session identity', async () => {
    // The UI stores DB user ids; the session carries a Plex account id and
    // the user's Plex title. The filter must match through the users table.
    await setFilterUsers([String(SEED_USERS[0].id)])
    await insertMasterShow()

    const fakeSonarr = stubBoundaries(
      makeEpisodeSession({
        season: 1,
        episode: 15,
        userId: 'plex-9001',
        username: SEED_USERS[0].name,
      }),
    )

    const result = await app.plexSessionMonitor.monitorSessions()

    expect(result.triggeredSearches).toBe(1)
    expect(fakeSonarr.updateSeasonMonitoring).toHaveBeenCalledWith(
      1566,
      2,
      true,
    )
    expect(fakeSonarr.searchSeason).toHaveBeenCalledWith(1566, 2)
  })

  it('matches by plex uuid from the session avatar when the title diverges', async () => {
    // A renamed Plex account: session title no longer matches users.name,
    // but the avatar URL still carries the stored plex_uuid
    await setFilterUsers([String(SEED_USERS[0].id)])
    await insertMasterShow()

    const knex = getTestDatabase()
    await knex('users')
      .where({ id: SEED_USERS[0].id })
      .update({ plex_uuid: 'ab12cd34ef56ab78' })

    const fakeSonarr = stubBoundaries(
      makeEpisodeSession({
        season: 1,
        episode: 15,
        userId: 'plex-9001',
        username: 'renamed-account',
        userThumb: 'https://plex.tv/users/ab12cd34ef56ab78/avatar?c=123',
      }),
    )

    const result = await app.plexSessionMonitor.monitorSessions()

    expect(result.triggeredSearches).toBe(1)
    expect(fakeSonarr.searchSeason).toHaveBeenCalledWith(1566, 2)
  })

  it('still matches legacy filter values holding raw Plex usernames', async () => {
    await setFilterUsers(['some-plex-viewer'])
    await insertMasterShow()

    const fakeSonarr = stubBoundaries(
      makeEpisodeSession({
        season: 1,
        episode: 15,
        userId: 'plex-9002',
        username: 'some-plex-viewer',
      }),
    )

    const result = await app.plexSessionMonitor.monitorSessions()

    expect(result.triggeredSearches).toBe(1)
    expect(fakeSonarr.searchSeason).toHaveBeenCalledWith(1566, 2)
  })

  it('does not let a filtered viewing burn the trigger for later passes', async () => {
    // A viewer excluded by the filter watches to the end of the monitored
    // season. Their position must not be recorded as evaluated - once the
    // filter is cleared, the next pass over the same session must still
    // expand to the next season.
    await setFilterUsers([String(SEED_USERS[0].id)])
    await insertMasterShow()

    const session = makeEpisodeSession({
      season: 1,
      episode: 16,
      userId: 'plex-777',
      username: 'someone-else',
    })
    const firstPass = stubBoundaries(session)

    const filteredResult = await app.plexSessionMonitor.monitorSessions()
    expect(filteredResult.triggeredSearches).toBe(0)
    expect(firstPass.updateSeasonMonitoring).not.toHaveBeenCalled()

    // The per-user row exists (activity is tracked for inactivity handling)
    const knex = getTestDatabase()
    const userRow = await knex('rolling_monitored_shows')
      .where({ plex_user_id: 'plex-777' })
      .first()
    expect(userRow).toBeDefined()

    await setFilterUsers([])
    const secondPass = stubBoundaries(session)

    const allowedResult = await app.plexSessionMonitor.monitorSessions()
    expect(allowedResult.triggeredSearches).toBe(1)
    expect(secondPass.updateSeasonMonitoring).toHaveBeenCalledWith(
      1566,
      2,
      true,
    )
    expect(secondPass.searchSeason).toHaveBeenCalledWith(1566, 2)
  })

  it('blocks sessions from users not covered by the filter', async () => {
    await setFilterUsers([String(SEED_USERS[0].id)])
    await insertMasterShow()

    const fakeSonarr = stubBoundaries(
      makeEpisodeSession({
        season: 1,
        episode: 15,
        userId: 'plex-777',
        username: 'someone-else',
      }),
    )

    const result = await app.plexSessionMonitor.monitorSessions()

    expect(result.triggeredSearches).toBe(0)
    expect(fakeSonarr.updateSeasonMonitoring).not.toHaveBeenCalled()
  })
})
