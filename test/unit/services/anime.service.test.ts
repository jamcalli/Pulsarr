import type { InsertAnimeId } from '@root/types/anime.types.js'
import { AnimeService } from '@services/anime.service.js'
import type { DatabaseService } from '@services/database.service.js'
import { fetchContent } from '@utils/streaming-updater.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../mocks/logger.js'

vi.mock('@utils/streaming-updater.js', () => ({
  fetchContent: vi.fn(async () => ''),
}))

const ANIME_XML = `<?xml version="1.0" encoding="UTF-8"?>
<anime-list>
  <anime anidbid="1" tvdbid="72025" imdbid="tt0094625"/>
  <anime anidbid="2" imdbid="tt5311514"/>
  <anime anidbid="3" imdbid="tt0936323,tt0936320"/>
  <anime anidbid="4" tmdbid="357786,362584"/>
  <anime anidbid="5" tmdbtv="26209"/>
  <anime anidbid="6" tvdbid="movie" imdbid="tt0104652"/>
  <anime anidbid="7" tvdbid="72025" imdbid="tt0094625"/>
</anime-list>`

function createMockDb() {
  const truncate = vi.fn(async () => {})
  const trx = vi.fn(() => ({ truncate }))
  const bulkReplaceAnimeIds = vi.fn(async (_ids: InsertAnimeId[]) => {})
  const isAnyAnime = vi.fn(
    async (_ids: Array<{ externalId: string; source: string }>) => true,
  )

  const db = {
    transaction: vi.fn(async (fn: (t: typeof trx) => Promise<void>) => {
      await fn(trx)
    }),
    bulkReplaceAnimeIds,
    getAnimeCount: vi.fn(async () => 9),
    isAnyAnime,
  }

  return { db, bulkReplaceAnimeIds, isAnyAnime }
}

function createService(db: ReturnType<typeof createMockDb>['db']) {
  return new AnimeService(db as unknown as DatabaseService, createMockLogger())
}

async function parseRows(xml: string): Promise<InsertAnimeId[]> {
  vi.mocked(fetchContent).mockResolvedValue(xml)
  const { db, bulkReplaceAnimeIds } = createMockDb()

  const result = await createService(db).updateAnimeDatabase()

  expect(result.updated).toBe(true)
  expect(bulkReplaceAnimeIds).toHaveBeenCalledTimes(1)
  return bulkReplaceAnimeIds.mock.calls[0][0]
}

describe('AnimeService XML parsing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('stores IMDb ids in the canonical tt form the router looks up', async () => {
    const rows = await parseRows(ANIME_XML)

    expect(rows).toContainEqual({ external_id: 'tt0094625', source: 'imdb' })
    expect(rows).toContainEqual({ external_id: 'tt0104652', source: 'imdb' })
    expect(rows.filter((row) => row.source === 'imdb')).toSatisfy(
      (imdbRows: InsertAnimeId[]) =>
        imdbRows.every((row) => /^tt\d+$/.test(row.external_id)),
    )
  })

  it('keeps IMDb ids that arrive without zero padding', async () => {
    const rows = await parseRows(ANIME_XML)

    expect(rows).toContainEqual({ external_id: 'tt5311514', source: 'imdb' })
  })

  it('emits one row per id in a comma separated IMDb attribute', async () => {
    const rows = await parseRows(ANIME_XML)

    expect(rows).toContainEqual({ external_id: 'tt0936323', source: 'imdb' })
    expect(rows).toContainEqual({ external_id: 'tt0936320', source: 'imdb' })
  })

  it('emits one row per id in a comma separated TMDB movie attribute', async () => {
    const rows = await parseRows(ANIME_XML)

    expect(rows).toContainEqual({ external_id: '357786', source: 'tmdb_movie' })
    expect(rows).toContainEqual({ external_id: '362584', source: 'tmdb_movie' })
  })

  it('keeps TMDB TV and TVDB ids in their own sources', async () => {
    const rows = await parseRows(ANIME_XML)

    expect(rows.filter((row) => row.source === 'tmdb_tv')).toEqual([
      { external_id: '26209', source: 'tmdb_tv' },
    ])
    expect(rows.filter((row) => row.source === 'tvdb')).toEqual([
      { external_id: '72025', source: 'tvdb' },
    ])
  })

  it('skips non numeric TVDB values', async () => {
    const rows = await parseRows(
      '<anime-list><anime anidbid="1" tvdbid="movie" imdbid="tt0104652"/></anime-list>',
    )

    expect(rows.filter((row) => row.source === 'tvdb')).toEqual([])
  })

  it('deduplicates repeated source and id pairs', async () => {
    const rows = await parseRows(ANIME_XML)

    const keys = rows.map((row) => `${row.source}:${row.external_id}`)
    expect(new Set(keys).size).toBe(keys.length)
    expect(rows).toHaveLength(9)
  })
})

describe('AnimeService.isAnime source namespaces', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('checks tmdb_movie and imdb for movies', async () => {
    const { db, isAnyAnime } = createMockDb()

    await createService(db).isAnime('movie', '72025', '357786', 'tt0094625')

    expect(isAnyAnime).toHaveBeenCalledWith([
      { externalId: 'tt0094625', source: 'imdb' },
      { externalId: '357786', source: 'tmdb_movie' },
    ])
  })

  it('checks tmdb_tv, tvdb and imdb for shows', async () => {
    const { db, isAnyAnime } = createMockDb()

    await createService(db).isAnime('show', '72025', '357786', 'tt0094625')

    expect(isAnyAnime).toHaveBeenCalledWith([
      { externalId: 'tt0094625', source: 'imdb' },
      { externalId: '357786', source: 'tmdb_tv' },
      { externalId: '72025', source: 'tvdb' },
    ])
  })
})
