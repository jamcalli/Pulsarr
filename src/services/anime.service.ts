/**
 * Anime Service
 *
 * Handles fetching, parsing, and maintaining the anime lookup database
 * from the AniDB anime-list-full.xml file.
 */

import type { InsertAnimeId } from '@root/types/anime.types.js'
import { ANIME_LIST_URL, ANIME_SOURCES } from '@root/types/anime.types.js'
import type { DatabaseService } from '@services/database.service.js'
import { createServiceLogger } from '@utils/logger.js'
import { fetchContent } from '@utils/streaming-updater.js'
import { XMLParser } from 'fast-xml-parser'
import type { FastifyBaseLogger } from 'fastify'

export class AnimeService {
  private static readonly USER_AGENT =
    'Pulsarr/1.0 (+https://github.com/jamcalli/pulsarr)'
  /** Creates a fresh service logger that inherits current log level */

  private get log(): FastifyBaseLogger {
    return createServiceLogger(this.baseLog, 'ANIME')
  }

  constructor(
    private readonly db: DatabaseService,
    private readonly baseLog: FastifyBaseLogger,
  ) {}

  /**
   * Check if any external IDs indicate anime content
   */
  async isAnime(
    tvdbId?: string,
    tmdbId?: string,
    imdbId?: string,
  ): Promise<boolean> {
    const ids: Array<{ externalId: string; source: string }> = []

    if (tvdbId) ids.push({ externalId: tvdbId, source: 'tvdb' })
    if (tmdbId) ids.push({ externalId: tmdbId, source: 'tmdb' })
    if (imdbId) ids.push({ externalId: imdbId, source: 'imdb' })

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
        userAgent: AnimeService.USER_AGENT,
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
      const tmdbCount = animeIds.filter((id) => id.source === 'tmdb').length
      const imdbCount = animeIds.filter((id) => id.source === 'imdb').length
      this.log.info(
        `Breakdown: ${tvdbCount} TVDB IDs, ${tmdbCount} TMDB IDs, ${imdbCount} IMDb IDs`,
      )

      if (animeIds.length === 0) {
        this.log.warn('No anime IDs found in XML, skipping database update')
        return { count: 0, updated: false }
      }

      this.log.info(`Parsed data in memory, now updating database...`)

      // Quick atomic replacement using short transaction
      await this.db.knex.transaction(async (trx) => {
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

        // Extract IDs from anime element attributes
        const tvdbId = anime.tvdbid?.toString().trim()
        const tmdbId = (anime.tmdbid ?? anime.tmdbtv)?.toString().trim()
        const imdbId = anime.imdbid?.toString().trim()

        // Add TVDB ID if present and numeric
        if (tvdbId && tvdbId !== '' && !Number.isNaN(Number(tvdbId))) {
          animeIds.push({
            external_id: tvdbId,
            source: 'tvdb',
          })
        }

        // Add TMDB ID if present and numeric
        if (tmdbId && tmdbId !== '' && !Number.isNaN(Number(tmdbId))) {
          animeIds.push({
            external_id: tmdbId,
            source: 'tmdb',
          })
        }

        // Add IMDb ID if present (remove 'tt' prefix if exists)
        if (imdbId && imdbId !== '' && imdbId !== 'movie') {
          const cleanImdbId = imdbId.replace(/^tt/, '')
          if (cleanImdbId && !Number.isNaN(Number(cleanImdbId))) {
            animeIds.push({
              external_id: cleanImdbId,
              source: 'imdb',
            })
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
