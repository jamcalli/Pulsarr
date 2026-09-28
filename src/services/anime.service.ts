/**
 * Anime Service
 *
 * Handles fetching, parsing, and maintaining the anime lookup database
 * from the AniDB anime-list-full.xml file.
 */

import type { AnimeSource, InsertAnimeId } from '@root/types/anime.types.js'
import { ANIME_LIST_URL, ANIME_SOURCES } from '@root/types/anime.types.js'
import type { DatabaseService } from '@services/database.service.js'
import { canonicalImdbId, canonicalNumericId } from '@utils/guid-handler.js'
import { createServiceLogger } from '@utils/logger.js'
import { fetchContent } from '@utils/streaming-updater.js'
import { USER_AGENT } from '@utils/version.js'
import { XMLParser } from 'fast-xml-parser'
import type { FastifyBaseLogger } from 'fastify'

interface AnimeListEntry {
  tvdbid?: string | number
  tmdbid?: string | number
  tmdbtv?: string | number
  imdbid?: string | number
}

const ID_ATTRIBUTES: ReadonlyArray<{
  attribute: keyof AnimeListEntry
  source: AnimeSource
  canonical: (raw: string) => string | undefined
}> = [
  { attribute: 'tvdbid', source: 'tvdb', canonical: canonicalNumericId },
  { attribute: 'tmdbid', source: 'tmdb_movie', canonical: canonicalNumericId },
  { attribute: 'tmdbtv', source: 'tmdb_tv', canonical: canonicalNumericId },
  { attribute: 'imdbid', source: 'imdb', canonical: canonicalImdbId },
]

export class AnimeService {
  private readonly log: FastifyBaseLogger

  constructor(
    private readonly db: DatabaseService,
    readonly baseLog: FastifyBaseLogger,
  ) {
    this.log = createServiceLogger(baseLog, 'ANIME')
  }

  /**
   * Check if any external IDs indicate anime content.
   *
   * IMPORTANT: TMDB has separate ID namespaces for movies and TV shows.
   * The anime-lists XML provides `tmdbid` for movies and `tmdbtv` for TV.
   * We must check the appropriate source based on content type to avoid
   * false positives (e.g., movie ID 23122 != TV ID 23122).
   *
   * @param contentType - Whether this is a movie or show
   * @param tvdbId - TVDB ID (only checked for shows - anime-lists uses series IDs)
   * @param tmdbId - TMDB ID (checked against tmdb_movie or tmdb_tv based on content type)
   * @param imdbId - IMDB ID (safe for both - single namespace)
   */
  async isAnime(
    contentType: 'movie' | 'show',
    tvdbId?: string,
    tmdbId?: string,
    imdbId?: string,
  ): Promise<boolean> {
    const ids: Array<{ externalId: string; source: string }> = []

    // IMDB uses a single namespace for all content types - safe to check for both
    if (imdbId) ids.push({ externalId: imdbId, source: 'imdb' })

    if (contentType === 'movie') {
      // Movies: only check tmdb_movie source
      // Skip TVDB - anime-lists tvdbid is primarily for TV series
      if (tmdbId) ids.push({ externalId: tmdbId, source: 'tmdb_movie' })
    } else {
      // Shows: check tmdb_tv and tvdb sources
      if (tmdbId) ids.push({ externalId: tmdbId, source: 'tmdb_tv' })
      if (tvdbId) ids.push({ externalId: tvdbId, source: 'tvdb' })
    }

    if (ids.length === 0) return false

    return this.db.isAnyAnime(ids)
  }

  /**
   * Download and parse the anime list XML, then update the database
   */
  async updateAnimeDatabase(): Promise<{ count: number; updated: boolean }> {
    try {
      this.log.info('Starting anime database update...')

      // Download and parse XML into memory first (dataset is small enough)
      this.log.info('Downloading anime list XML...')
      const xmlContent = await fetchContent({
        url: ANIME_LIST_URL,
        userAgent: USER_AGENT,
        timeout: 120000, // 2 minutes timeout
        retries: 2,
      })
      this.log.info(
        `Downloaded anime list XML (${Buffer.byteLength(xmlContent, 'utf8')} bytes)`,
      )

      // Parse the XML and extract IDs
      const animeIds = this.parseAnimeXml(xmlContent)
      this.log.info(`Parsed ${animeIds.length} anime ID entries`)

      // Log breakdown by source
      const tvdbCount = animeIds.filter((id) => id.source === 'tvdb').length
      const tmdbMovieCount = animeIds.filter(
        (id) => id.source === 'tmdb_movie',
      ).length
      const tmdbTvCount = animeIds.filter(
        (id) => id.source === 'tmdb_tv',
      ).length
      const imdbCount = animeIds.filter((id) => id.source === 'imdb').length
      this.log.info(
        `Breakdown: ${tvdbCount} TVDB, ${tmdbMovieCount} TMDB Movie, ${tmdbTvCount} TMDB TV, ${imdbCount} IMDb`,
      )

      if (animeIds.length === 0) {
        this.log.warn('No anime IDs found in XML, skipping database update')
        return { count: 0, updated: false }
      }

      this.log.info(`Parsed data in memory, now updating database...`)

      // Quick atomic replacement using short transaction
      await this.db.transaction(async (trx) => {
        await trx('anime_ids').truncate()
        this.log.info('Cleared existing anime IDs')

        // Use optimized bulk replacement method (no conflict resolution needed)
        await this.db.bulkReplaceAnimeIds(animeIds, trx)
        this.log.info('Inserted anime IDs into database')
      })

      const finalCount = await this.db.getAnimeCount()
      this.log.info(
        `Anime database updated successfully with ${finalCount} entries`,
      )

      return { count: finalCount, updated: true }
    } catch (error) {
      // Non-critical: log and continue without anime detection
      this.log.error(
        { error },
        'Failed to update anime database - continuing without anime detection',
      )
      return { count: 0, updated: false }
    }
  }

  /**
   * Parse the anime-list-full.xml and extract all external IDs
   */
  private parseAnimeXml(xmlContent: string): InsertAnimeId[] {
    const animeIds: InsertAnimeId[] = []

    try {
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '',
        isArray: (tagName) => tagName === 'anime' || tagName === 'mapping',
      })

      const parsed = parser.parse(xmlContent)
      const animeList = parsed['anime-list']?.anime || []

      // Ensure we have an array to work with
      const animes = Array.isArray(animeList) ? animeList : [animeList]
      this.log.info(`Processing ${animes.length} anime entries from XML`)

      for (const anime of animes) {
        if (!anime || typeof anime !== 'object') continue

        for (const { attribute, source, canonical } of ID_ATTRIBUTES) {
          const raw = (anime as AnimeListEntry)[attribute]
          if (raw === undefined) continue

          // One AniDB entry can map to several external ids, comma separated
          for (const part of raw.toString().split(',')) {
            const externalId = canonical(part)
            if (externalId) animeIds.push({ external_id: externalId, source })
          }
        }
      }

      // Remove duplicates
      const seen = new Set<string>()
      return animeIds.filter((item) => {
        const key = `${item.source}:${item.external_id}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    } catch (error) {
      this.log.error({ error }, 'Failed to parse anime XML:')
      throw new Error(
        `XML parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  /**
   * Get statistics about the anime database
   */
  async getStats(): Promise<{
    totalCount: number
    lastUpdated: Date | null
    countBySource: Record<string, number>
  }> {
    const totalCount = await this.db.getAnimeCount()
    const lastUpdated = await this.db.getLastUpdated()

    const sources = ANIME_SOURCES
    const countBySource: Record<string, number> = {}

    for (const source of sources) {
      countBySource[source] = await this.db.getAnimeCountBySource(source)
    }

    return {
      totalCount,
      lastUpdated,
      countBySource,
    }
  }
}
