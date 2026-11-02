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

  describe('guid lookups', () => {
    const track = () =>
      app.db.trackPlexLabels(
        ['IMDB://tt0111161', 'tmdb:278'],
        'movie',
        SEED_USERS[0].id,
        '12345',
        ['pulsarr:alice'],
      )

    it('stores the guids normalized', async () => {
      await track()

      const row = await getTestDatabase()('plex_label_tracking').first()
      expect(JSON.parse(row.content_guids)).toEqual([
        'imdb:tt0111161',
        'tmdb:278',
      ])
    })

    it('matches mixed-case and provider:// input', async () => {
      await track()

      const rows = await app.db.getTrackedLabelsForContent(
        ['TMDB://278'],
        'movie',
      )
      expect(rows.map((row) => row.plex_rating_key)).toEqual(['12345'])
      expect(
        await app.db.isLabelTracked(
          ['Imdb:TT0111161'],
          'movie',
          SEED_USERS[0].id,
          '12345',
          'pulsarr:alice',
        ),
      ).toBe(true)
    })

    it('does not match a guid that is a string prefix of a stored one', async () => {
      await track()

      expect(
        await app.db.getTrackedLabelsForContent(['tmdb:27'], 'movie'),
      ).toEqual([])
    })

    it('applies the content type filter', async () => {
      await track()

      expect(
        await app.db.getTrackedLabelsForContent(['tmdb:278'], 'show'),
      ).toEqual([])
      expect(
        await app.db.cleanupUserContentTracking(
          ['tmdb:278'],
          'show',
          SEED_USERS[0].id,
        ),
      ).toBe(0)
    })

    it('untracks and cleans up by normalized guid', async () => {
      await track()

      const result = await app.db.untrackPlexLabelBulk([
        {
          contentGuids: ['TMDB://278'],
          userId: SEED_USERS[0].id,
          plexRatingKey: '12345',
          labelApplied: 'pulsarr:alice',
        },
      ])

      expect(result).toEqual({ processedCount: 1, failedIds: [] })
      expect(await getTestDatabase()('plex_label_tracking')).toHaveLength(0)
    })

    it('cleans up a user row by normalized guid', async () => {
      await track()

      expect(
        await app.db.cleanupUserContentTracking(
          ['IMDB://tt0111161'],
          'movie',
          SEED_USERS[0].id,
        ),
      ).toBe(1)
    })
  })
})
