import type { RollingMonitoredShow } from '@root/types/plex-session.types.js'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../../../helpers/database.js'
import { insertRollingShow } from '../../../../helpers/rolling-shows.js'
import { seedAll } from '../../../../helpers/seeds/index.js'

const stella = (overrides: Partial<RollingMonitoredShow> = {}) =>
  insertRollingShow(getTestDatabase(), {
    show_title: 'Stella',
    monitoring_type: 'firstSeasonRolling',
    sonarr_series_id: 1566,
    sonarr_instance_id: 1,
    tvdb_id: '90210',
    ...overrides,
  })

describe('session database methods', () => {
  let fastify: FastifyInstance

  beforeAll(async () => {
    fastify = await build()
    await fastify.ready()
  })

  afterAll(async () => {
    await fastify.close()
  })

  beforeEach(async () => {
    await resetDatabase()
    await seedAll(getTestDatabase())
  })

  describe('getRollingMonitoredShowMatches', () => {
    it('matches by tvdb id when Plex and Sonarr agree', async () => {
      const id = await stella()

      const result = await fastify.db.getRollingMonitoredShowMatches(
        '90210',
        'Something Else',
      )

      expect(result.matchedBy).toBe('tvdb')
      expect(result.shows.map((show) => show.id)).toEqual([id])
    })

    it('falls back to the title when the show was enrolled without a tvdb id', async () => {
      const id = await stella({ tvdb_id: '' })

      const result = await fastify.db.getRollingMonitoredShowMatches(
        '90210',
        'Stella',
      )

      expect(result.matchedBy).toBe('title')
      expect(result.shows.map((show) => show.id)).toEqual([id])
    })

    it('falls back to a normalized title when Plex has no tvdb id', async () => {
      const id = await stella({ tvdb_id: '11111', show_title: 'Stella (2023)' })

      const result = await fastify.db.getRollingMonitoredShowMatches(
        undefined,
        'stella!',
      )

      expect(result.matchedBy).toBe('title')
      expect(result.shows.map((show) => show.id)).toEqual([id])
    })

    it('does not title match a row whose tvdb id differs', async () => {
      await stella({ tvdb_id: '11111' })

      const result = await fastify.db.getRollingMonitoredShowMatches(
        '90210',
        'Stella',
      )

      expect(result).toEqual({ matchedBy: 'none', shows: [] })
    })

    it('scopes the title fallback to the viewer rows', async () => {
      await stella({ tvdb_id: '' })
      const viewerId = await stella({
        tvdb_id: '',
        plex_user_id: 'u_nicole',
        plex_username: 'nicole3876',
      })

      const result = await fastify.db.getRollingMonitoredShowMatches(
        '90210',
        'Stella',
        'u_nicole',
      )

      expect(result.shows.map((show) => show.id)).toEqual([viewerId])
    })

    it('matches nothing when two different shows share the normalized title', async () => {
      await stella({ tvdb_id: '' })
      await stella({ tvdb_id: '', sonarr_series_id: 1567 })

      const result = await fastify.db.getRollingMonitoredShowMatches(
        '90210',
        'Stella',
      )

      expect(result).toEqual({ matchedBy: 'ambiguousTitle', shows: [] })
    })

    it('matches the same show on two instances by title', async () => {
      const db = getTestDatabase()
      const [sonarr] = await db('sonarr_instances').where({ id: 1 })
      await db('sonarr_instances').insert({
        ...sonarr,
        id: 2,
        name: 'Sonarr 4K',
        base_url: 'http://sonarr-4k:8989',
      })
      await db('sqlite_sequence')
        .where({ name: 'sonarr_instances' })
        .update({ seq: 2 })
      const first = await stella({ tvdb_id: '371980' })
      const second = await stella({ tvdb_id: '371980', sonarr_instance_id: 2 })

      const result = await fastify.db.getRollingMonitoredShowMatches(
        undefined,
        'Stella',
      )

      expect(result.matchedBy).toBe('title')
      expect(result.shows.map((show) => show.id).toSorted()).toEqual(
        [first, second].toSorted(),
      )
    })

    it('matches nothing without a tvdb hit or a title', async () => {
      await stella({ tvdb_id: '' })

      const result = await fastify.db.getRollingMonitoredShowMatches('90210')

      expect(result).toEqual({ matchedBy: 'none', shows: [] })
    })
  })

  describe('createOrFindUserRollingMonitoredShow', () => {
    const createViewerRow = async (
      monitoringType: RollingMonitoredShow['monitoring_type'],
    ) => {
      const masterId = await stella({
        monitoring_type: monitoringType,
        current_monitored_season: 3,
      })
      const master = await fastify.db.getRollingMonitoredShowById(masterId)
      if (!master) throw new Error('master row missing')
      return fastify.db.createOrFindUserRollingMonitoredShow(
        master,
        'u_nicole',
        'nicole3876',
      )
    }

    it.each([
      ['pilotRolling', 1],
      ['firstSeasonRolling', 1],
      ['allSeasonPilotRolling', 0],
    ] as const)(
      'starts a new %s viewer row at its baseline season',
      async (monitoringType, baseline) => {
        const id = await createViewerRow(monitoringType)

        expect(await fastify.db.getRollingMonitoredShowById(id)).toMatchObject({
          current_monitored_season: baseline,
          last_watched_season: 0,
          last_watched_episode: 0,
        })
      },
    )

    it('returns the existing viewer row on a second call', async () => {
      const masterId = await stella()
      const master = await fastify.db.getRollingMonitoredShowById(masterId)
      if (!master) throw new Error('master row missing')

      const first = await fastify.db.createOrFindUserRollingMonitoredShow(
        master,
        'u_nicole',
        'nicole3876',
      )
      const second = await fastify.db.createOrFindUserRollingMonitoredShow(
        master,
        'u_nicole',
        'nicole3876',
      )

      expect(second).toBe(first)
    })
  })
})
