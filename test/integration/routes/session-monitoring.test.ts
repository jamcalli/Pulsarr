import type { RollingMonitoredShow } from '@root/types/plex-session.types.js'
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
import { build } from '../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../helpers/database.js'
import { insertRollingShow } from '../../helpers/rolling-shows.js'
import { seedAll } from '../../helpers/seeds/index.js'

describe('Session Monitoring Routes - bulk manage', () => {
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
    app.config.authenticationMethod = 'disabled'

    app.plexSessionMonitor.resetToPilotOnly = vi
      .fn()
      .mockResolvedValue(undefined)
    app.plexSessionMonitor.resetToFirstSeasonOnly = vi
      .fn()
      .mockResolvedValue(undefined)
    app.plexSessionMonitor.resetToAllSeasonPilots = vi
      .fn()
      .mockResolvedValue(undefined)
    app.plexSessionMonitor.monitorAllSeasonPilots = vi
      .fn()
      .mockResolvedValue(undefined)
  })

  async function seedEnrolledShow(
    monitoringType: RollingMonitoredShow['monitoring_type'] = 'pilotRolling',
    seriesId = 100,
  ) {
    const knex = getTestDatabase()
    const masterId = await insertRollingShow(knex, {
      show_title: `Test Show ${seriesId}`,
      monitoring_type: monitoringType,
      sonarr_series_id: seriesId,
      sonarr_instance_id: 1,
      tvdb_id: `${seriesId}456`,
      current_monitored_season:
        monitoringType === 'allSeasonPilotRolling' ? 0 : 1,
    })
    const userId = await insertRollingShow(knex, {
      show_title: `Test Show ${seriesId}`,
      monitoring_type: monitoringType,
      sonarr_series_id: seriesId,
      sonarr_instance_id: 1,
      tvdb_id: `${seriesId}456`,
      plex_user_id: 'user-1',
      plex_username: 'Alice',
    })
    return { masterId, userId }
  }

  function showEntry(rollingShowId: number | null, seriesId = 100) {
    return {
      sonarrSeriesId: seriesId,
      sonarrInstanceId: 1,
      title: `Test Show ${seriesId}`,
      guids: [`tvdb:${seriesId}456`],
      rollingShowId,
    }
  }

  function bulkBody(
    shows: ReturnType<typeof showEntry>[],
    monitoringType: string,
    resetMonitoring: boolean,
  ) {
    return { shows, monitoringType, resetMonitoring }
  }

  it('skips same-type shows when reset is not requested', async () => {
    const { masterId, userId } = await seedEnrolledShow()

    const res = await app.inject({
      method: 'POST',
      url: '/v1/session-monitoring/rolling-monitored/bulk',
      payload: bulkBody([showEntry(masterId)], 'pilotRolling', false),
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      enrolled: 0,
      modified: 0,
      skipped: 1,
      failed: 0,
    })
    expect(app.plexSessionMonitor.resetToPilotOnly).not.toHaveBeenCalled()

    const knex = getTestDatabase()
    const userEntry = await knex('rolling_monitored_shows')
      .where({ id: userId })
      .first()
    expect(userEntry).toBeDefined()
  })

  it('resets same-type shows when reset is requested', async () => {
    const { masterId, userId } = await seedEnrolledShow()

    const res = await app.inject({
      method: 'POST',
      url: '/v1/session-monitoring/rolling-monitored/bulk',
      payload: bulkBody([showEntry(masterId)], 'pilotRolling', true),
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      enrolled: 0,
      modified: 1,
      skipped: 0,
      failed: 0,
    })
    expect(app.plexSessionMonitor.resetToPilotOnly).toHaveBeenCalledWith(
      100,
      1,
      'Test Show 100',
    )

    const knex = getTestDatabase()
    const userEntry = await knex('rolling_monitored_shows')
      .where({ id: userId })
      .first()
    expect(userEntry).toBeUndefined()

    const master = await knex('rolling_monitored_shows')
      .where({ id: masterId })
      .first()
    expect(master.monitoring_type).toBe('pilotRolling')
    expect(master.current_monitored_season).toBe(1)
  })

  it('keeps the season-0 baseline when resetting a same-type allSeasonPilotRolling show', async () => {
    const { masterId } = await seedEnrolledShow('allSeasonPilotRolling')

    const res = await app.inject({
      method: 'POST',
      url: '/v1/session-monitoring/rolling-monitored/bulk',
      payload: bulkBody([showEntry(masterId)], 'allSeasonPilotRolling', true),
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ modified: 1, failed: 0 })
    expect(app.plexSessionMonitor.resetToAllSeasonPilots).toHaveBeenCalledWith(
      100,
      1,
      'Test Show 100',
    )

    const knex = getTestDatabase()
    const master = await knex('rolling_monitored_shows')
      .where({ id: masterId })
      .first()
    expect(master.current_monitored_season).toBe(0)
  })

  it('changes type without touching Sonarr when reset is not requested', async () => {
    const { masterId, userId } = await seedEnrolledShow()

    const res = await app.inject({
      method: 'POST',
      url: '/v1/session-monitoring/rolling-monitored/bulk',
      payload: bulkBody([showEntry(masterId)], 'firstSeasonRolling', false),
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      enrolled: 0,
      modified: 1,
      skipped: 0,
      failed: 0,
    })
    expect(app.plexSessionMonitor.resetToPilotOnly).not.toHaveBeenCalled()
    expect(app.plexSessionMonitor.resetToFirstSeasonOnly).not.toHaveBeenCalled()

    const knex = getTestDatabase()
    const master = await knex('rolling_monitored_shows')
      .where({ id: masterId })
      .first()
    expect(master.monitoring_type).toBe('firstSeasonRolling')

    const userEntry = await knex('rolling_monitored_shows')
      .where({ id: userId })
      .first()
    expect(userEntry).toBeDefined()
    expect(userEntry.monitoring_type).toBe('firstSeasonRolling')
  })

  it('seeds season pilots when converting to allSeasonPilotRolling without a reset', async () => {
    const { masterId, userId } = await seedEnrolledShow()

    const res = await app.inject({
      method: 'POST',
      url: '/v1/session-monitoring/rolling-monitored/bulk',
      payload: bulkBody([showEntry(masterId)], 'allSeasonPilotRolling', false),
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ modified: 1, failed: 0 })
    expect(app.plexSessionMonitor.monitorAllSeasonPilots).toHaveBeenCalledWith(
      100,
      1,
    )
    expect(app.plexSessionMonitor.resetToAllSeasonPilots).not.toHaveBeenCalled()

    const knex = getTestDatabase()
    const master = await knex('rolling_monitored_shows')
      .where({ id: masterId })
      .first()
    expect(master.monitoring_type).toBe('allSeasonPilotRolling')
    expect(master.current_monitored_season).toBe(0)

    const userEntry = await knex('rolling_monitored_shows')
      .where({ id: userId })
      .first()
    expect(userEntry.monitoring_type).toBe('allSeasonPilotRolling')
  })

  it('changes type and resets to the new baseline when reset is requested', async () => {
    const { masterId, userId } = await seedEnrolledShow()

    const res = await app.inject({
      method: 'POST',
      url: '/v1/session-monitoring/rolling-monitored/bulk',
      payload: bulkBody([showEntry(masterId)], 'firstSeasonRolling', true),
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      enrolled: 0,
      modified: 1,
      skipped: 0,
      failed: 0,
    })
    expect(app.plexSessionMonitor.resetToFirstSeasonOnly).toHaveBeenCalledWith(
      100,
      1,
      'Test Show 100',
    )
    expect(app.plexSessionMonitor.resetToPilotOnly).not.toHaveBeenCalled()

    const knex = getTestDatabase()
    const master = await knex('rolling_monitored_shows')
      .where({ id: masterId })
      .first()
    expect(master.monitoring_type).toBe('firstSeasonRolling')

    const userEntry = await knex('rolling_monitored_shows')
      .where({ id: userId })
      .first()
    expect(userEntry).toBeUndefined()
  })

  it('does not double-seed pilots when enrolling into allSeasonPilotRolling with a reset', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/session-monitoring/rolling-monitored/bulk',
      payload: bulkBody([showEntry(null, 300)], 'allSeasonPilotRolling', true),
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ enrolled: 1, failed: 0 })
    expect(app.plexSessionMonitor.resetToAllSeasonPilots).toHaveBeenCalledWith(
      300,
      1,
      'Test Show 300',
    )
    expect(app.plexSessionMonitor.monitorAllSeasonPilots).not.toHaveBeenCalled()
  })

  it('continues past a failing show and reports it as failed', async () => {
    const showA = await seedEnrolledShow('pilotRolling', 100)
    const showB = await seedEnrolledShow('pilotRolling', 200)

    app.plexSessionMonitor.resetToPilotOnly = vi
      .fn()
      .mockRejectedValueOnce(new Error('Sonarr instance 1 not found'))
      .mockResolvedValueOnce(undefined)

    const res = await app.inject({
      method: 'POST',
      url: '/v1/session-monitoring/rolling-monitored/bulk',
      payload: bulkBody(
        [showEntry(showA.masterId, 100), showEntry(showB.masterId, 200)],
        'pilotRolling',
        true,
      ),
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      success: false,
      modified: 1,
      failed: 1,
    })

    const knex = getTestDatabase()
    const userA = await knex('rolling_monitored_shows')
      .where({ id: showA.userId })
      .first()
    expect(userA).toBeDefined()

    const userB = await knex('rolling_monitored_shows')
      .where({ id: showB.userId })
      .first()
    expect(userB).toBeUndefined()
  })
})
