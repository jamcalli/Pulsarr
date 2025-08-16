/**
 * Anime Service
 *
 * Handles fetching, parsing, and maintaining the anime lookup database
 * from the AniDB anime-list-full.xml file.
 */

import type { InsertAnimeId } from '@root/types/anime.types.js'
import { ANIME_LIST_URL, ANIME_SOURCES } from '@root/types/anime.types.js'
import type { DatabaseService } from '@services/database.service.js'
import { XMLParser } from 'fast-xml-parser'
import type { FastifyBaseLogger } from 'fastify'

export class AnimeService {
  private static readonly USER_AGENT =
    'Pulsarr/1.0 (+https://github.com/jamcalli/pulsarr)'

  constructor(
    private readonly db: DatabaseService,
    private readonly logger: FastifyBaseLogger,
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
      this.logger.info('Starting anime database update...')

      // Download the XML file
      const response = await fetch(ANIME_LIST_URL, {
        headers: {
          'User-Agent': AnimeService.USER_AGENT,
        },
      })

      if (!response.ok) {
        throw new Error(
          `Failed to fetch anime list: ${response.status} ${response.statusText}`,
        )
      }

      const xmlContent = await response.text()
      this.logger.info(`Downloaded anime list XML (${xmlContent.length} bytes)`)

      // Parse the XML and extract IDs
      const animeIds = this.parseAnimeXml(xmlContent)
      this.logger.info(`Parsed ${animeIds.length} anime ID entries`)

      // Log breakdown by source
      const tvdbCount = animeIds.filter((id) => id.source === 'tvdb').length
      const tmdbCount = animeIds.filter((id) => id.source === 'tmdb').length
      const imdbCount = animeIds.filter((id) => id.source === 'imdb').length
      this.logger.info(
        `Breakdown: ${tvdbCount} TVDB IDs, ${tmdbCount} TMDB IDs, ${imdbCount} IMDb IDs`,
      )

      if (animeIds.length === 0) {
        this.logger.warn('No anime IDs found in XML, skipping database update')
        return { count: 0, updated: false }
      }

      // Use transaction for atomic replacement to avoid temporary empty state
      await this.db.knex.transaction(async (trx) => {
        await trx('anime_ids').del()
        this.logger.info('Cleared existing anime IDs')

        await this.db.insertAnimeIds(animeIds, trx)
      })

      const finalCount = await this.db.getAnimeCount()
      this.logger.info(
        `Anime database updated successfully with ${finalCount} entries`,
      )

      return { count: finalCount, updated: true }
    } catch (error) {
      // Non-critical: log and continue without anime detection
      this.logger.error(
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
      this.logger.info(`Processing ${animes.length} anime entries from XML`)

      for (const anime of animes) {
        if (!anime || typeof anime !== 'object') continue

        // Extract IDs from anime element attributes
        const tvdbId = anime.tvdbid?.toString().trim()
        const tmdbId = anime.tmdbid?.toString().trim()
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
      this.logger.error({ error }, 'Failed to parse anime XML:')
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
