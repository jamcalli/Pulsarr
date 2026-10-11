import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../../../helpers/database.js'
import { SEED_USERS, seedAll } from '../../../../helpers/seeds/index.js'

describe('plex label tracking database methods', () => {
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
  })

  const systemRows = () =>
    getTestDatabase()('plex_label_tracking').whereNull('user_id')

  it('upserts a system row instead of duplicating it', async () => {
    await app.db.trackPlexLabels(['imdb:tt0111161'], 'movie', null, '12345', [
      'pulsarr:removed',
    ])
    await app.db.trackPlexLabels(['imdb:tt0111161'], 'movie', null, '12345', [
      'pulsarr:removed',
    ])

    expect(await systemRows()).toHaveLength(1)
  })

  it('untracks a label from a system row', async () => {
    await app.db.trackPlexLabels(['imdb:tt0111161'], 'movie', null, '12345', [
      'pulsarr:removed',
    ])
    await app.db.trackPlexLabels(
      ['imdb:tt0111161'],
      'movie',
      SEED_USERS[0].id,
      '12345',
      ['pulsarr:test-user-primary'],
    )

    const result = await app.db.untrackPlexLabelBulk([
      {
        contentGuids: ['imdb:tt0111161'],
        userId: null,
        plexRatingKey: '12345',
        labelApplied: 'pulsarr:removed',
      },
    ])

    expect(result).toEqual({ processedCount: 1, failedIds: [] })
    expect(await systemRows()).toHaveLength(0)
    const userRows = await getTestDatabase()('plex_label_tracking').where({
      user_id: SEED_USERS[0].id,
    })
    expect(userRows).toHaveLength(1)
  })

  it('moves rows to the new rating key and merges into an existing counterpart', async () => {
    await app.db.trackPlexLabels(
      ['imdb:tt0111161'],
      'movie',
      SEED_USERS[0].id,
      'old-key',
      ['pulsarr:alice', 'pulsarr:4k'],
    )
    await app.db.trackPlexLabels(
      ['imdb:tt0111161'],
      'movie',
      SEED_USERS[1].id,
      'old-key',
      ['pulsarr:bob'],
    )
    await app.db.trackPlexLabels(
      ['imdb:tt0111161'],
      'movie',
      SEED_USERS[0].id,
      'new-key',
      ['Pulsarr:Alice', 'pulsarr:hdr'],
    )

    const moved = await app.db.updateTrackingRatingKey('old-key', 'new-key')

    expect(moved).toBe(2)
    const rows = await getTestDatabase()('plex_label_tracking').orderBy(
      'user_id',
    )
    expect(rows.map((row) => row.plex_rating_key)).toEqual([
      'new-key',
      'new-key',
    ])
    expect(rows.map((row) => JSON.parse(row.labels_applied))).toEqual([
      ['pulsarr:4k', 'pulsarr:alice', 'pulsarr:hdr'],
      ['pulsarr:bob'],
    ])
  })
})
