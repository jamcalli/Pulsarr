/**
 * IMDB Service
 *
 * Handles fetching, parsing, and maintaining the IMDB ratings database
 * from the datasets.imdbws.com title.ratings.tsv.gz file.
 */

import { gunzipSync } from 'node:zlib'
import type { InsertImdbRating } from '@root/types/imdb.types.js'
import { IMDB_RATINGS_URL } from '@root/types/imdb.types.js'
import type { DatabaseService } from '@services/database.service.js'
import { extractTypedGuid } from '@utils/guid-handler.js'
import { createServiceLogger } from '@utils/logger.js'
import type { FastifyBaseLogger } from 'fastify'

export class ImdbService {
  private static readonly USER_AGENT =
    'Pulsarr/1.0 (+https://github.com/jamcalli/pulsarr)'

  private get log(): FastifyBaseLogger {
    return createServiceLogger(this.baseLog, 'IMDB')
  }

  constructor(
    private readonly db: DatabaseService,
    private readonly baseLog: FastifyBaseLogger,
  ) {}

  /**
   * Check if a title has IMDB rating data
   *
   * @param guids - GUID array or single GUID string (e.g., ["imdb:tt1234567", "tmdb:123"])
   * @returns True if IMDB rating data exists, false if no IMDB GUID or no rating data
   */
  async hasRating(guids: string[] | string | undefined): Promise<boolean> {
    // Extract IMDB GUID using shared utility
    const imdbGuid = extractTypedGuid(guids, 'imdb:')
    if (!imdbGuid) {
      return false // No IMDB GUID present
    }

    // Extract tconst (tt1234567) from imdb:tt1234567
    const tconst = imdbGuid.substring(5)
    const result = await this.db.getImdbRating(tconst)
    return result !== null
  }

  /**
   * Get IMDB rating for a title
   *
   * @param guids - GUID array or single GUID string (e.g., ["imdb:tt1234567", "tmdb:123"])
   * @returns Rating data object if found, null if no IMDB GUID or no rating data
   */
  async getRating(
    guids: string[] | string | undefined,
  ): Promise<{ rating: number | null; votes: number | null } | null> {
    // Extract IMDB GUID using shared utility
    const imdbGuid = extractTypedGuid(guids, 'imdb:')
    if (!imdbGuid) {
      return null // No IMDB GUID present
    }

    // Extract tconst (tt1234567) from imdb:tt1234567
    const tconst = imdbGuid.substring(5)
    const result = await this.db.getImdbRating(tconst)

    if (!result) {
      return null // No rating data found
    }

    return {
      rating: result.averageRating,
      votes: result.numVotes,
    }
  }

  /**
   * Download and parse the IMDB ratings TSV file, then update the database
   */
  async updateImdbDatabase(): Promise<{ count: number; updated: boolean }> {
    try {
      this.log.info('Starting IMDB ratings database update...')

      // Download the gzipped TSV file
      const response = await fetch(IMDB_RATINGS_URL, {
        headers: {
          'User-Agent': ImdbService.USER_AGENT,
        },
        signal: AbortSignal.timeout(60000), // 60 seconds timeout
      })

      if (!response.ok) {
        throw new Error(
          `Failed to fetch IMDB ratings: ${response.status} ${response.statusText}`,
        )
      }

      const gzippedBuffer = await response.arrayBuffer()
      this.log.info(
        `Downloaded IMDB ratings file (${gzippedBuffer.byteLength} bytes)`,
      )

      // Decompress and parse the TSV content
      const tsvContent = gunzipSync(Buffer.from(gzippedBuffer)).toString('utf8')
      const ratings = this.parseRatingsTsv(tsvContent)
      this.log.info(`Parsed ${ratings.length} IMDB rating entries`)

      if (ratings.length === 0) {
        this.log.warn('No IMDB ratings found in TSV, skipping database update')
        return { count: 0, updated: false }
      }

      // Use transaction for atomic replacement to avoid temporary empty state
      await this.db.knex.transaction(async (trx) => {
        await trx('imdb_ratings').del()
        this.log.info('Cleared existing IMDB ratings')

        await this.db.insertImdbRatings(ratings, trx)
      })

      const finalCount = await this.db.getImdbRatingCount()
      this.log.info(
        `IMDB ratings database updated successfully with ${finalCount} entries`,
      )

      return { count: finalCount, updated: true }
    } catch (error) {
      this.log.error(
        { error },
        'Failed to update IMDB ratings database - continuing without IMDB data',
      )
      return { count: 0, updated: false }
    }
  }

  /**
   * Parse the TSV content and extract IMDB ratings
   */
  private parseRatingsTsv(tsvContent: string): InsertImdbRating[] {
    const ratings: InsertImdbRating[] = []

    try {
      const lines = tsvContent.split('\n')

      for (let i = 1; i < lines.length; i++) {
        // Skip header line (i=0)
        const line = lines[i].trim()
        if (!line) continue

        const [tconst, averageRatingStr, numVotesStr] = line.split('\t')

        if (!tconst || !tconst.startsWith('tt')) continue

        const averageRating =
          averageRatingStr === '\\N' ? null : parseFloat(averageRatingStr)
        const numVotes =
          numVotesStr === '\\N' ? null : parseInt(numVotesStr, 10)

        // Validate the data
        if (
          averageRating !== null &&
          (Number.isNaN(averageRating) ||
            averageRating < 1 ||
            averageRating > 10)
        ) {
          continue
        }

        if (numVotes !== null && (Number.isNaN(numVotes) || numVotes < 0)) {
          continue
        }

        ratings.push({
          tconst,
          average_rating: averageRating,
          num_votes: numVotes,
        })
      }

      return ratings
    } catch (error) {
      this.log.error({ error }, 'Failed to parse IMDB TSV:')
      throw new Error(
        `TSV parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  /**
   * Get statistics about the IMDB ratings database
   */
  async getStats(): Promise<{
    totalCount: number
    lastUpdated: Date | null
    avgRating: number | null
    avgVotes: number | null
    highRatedCount: number
    popularCount: number
  }> {
    const lastUpdated = await this.db.getImdbLastUpdated()
    const stats = await this.db.getImdbRatingStats()

    return {
      totalCount: stats.totalCount,
      lastUpdated,
      avgRating: stats.avgRating,
      avgVotes: stats.avgVotes,
      highRatedCount: stats.highRatedCount,
      popularCount: stats.popularCount,
    }
  }
}
