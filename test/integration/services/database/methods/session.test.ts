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

    it('falls back to a normalized title when Sonarr holds a different tvdb id', async () => {
      const id = await stella({ tvdb_id: '11111', show_title: 'Stella (2023)' })

      const result = await fastify.db.getRollingMonitoredShowMatches(
        '90210',
        'stella!',
      )

      expect(result.matchedBy).toBe('title')
      expect(result.shows.map((show) => show.id)).toEqual([id])
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
        '90210',
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
})
