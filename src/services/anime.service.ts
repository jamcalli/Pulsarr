/**
 * Anime Service
 *
 * Handles fetching, parsing, and maintaining the anime lookup database
 * from the AniDB anime-list-full.xml file.
 */
import type { FastifyBaseLogger } from 'fastify'
import type { DatabaseService } from '@services/database.service.js'
import type { InsertAnimeId } from '@services/database/types/anime-methods.js'
import { XMLParser } from 'fast-xml-parser'

export class AnimeService {
  private static readonly ANIME_LIST_URL =
    'https://raw.githubusercontent.com/Anime-Lists/anime-lists/master/anime-list-full.xml'
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
      const response = await fetch(AnimeService.ANIME_LIST_URL, {
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

      // Clear existing data and insert new data
      await this.db.clearAllAnimeIds()
      this.logger.info('Cleared existing anime IDs')

      // Insert all at once - Knex batchInsert handles chunking automatically
      await this.db.insertAnimeIds(animeIds)

      const finalCount = await this.db.getAnimeCount()
      this.logger.info(
        `Anime database updated successfully with ${finalCount} entries`,
      )

      return { count: finalCount, updated: true }
    } catch (error) {
      this.logger.error('Failed to update anime database:', error)
      throw error
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
      this.logger.error('Failed to parse anime XML:', error)
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

    const sources = ['tvdb', 'tmdb', 'imdb']
    const countBySource: Record<string, number> = {}

    for (const source of sources) {
      const ids = await this.db.getAnimeIdsBySource(source)
      countBySource[source] = ids.length
    }

    return {
      totalCount,
      lastUpdated,
      countBySource,
    }
  }
}
