/**
 * IMDB Service
 *
 * Handles fetching, parsing, and maintaining the IMDB ratings database
 * from the datasets.imdbws.com title.ratings.tsv.gz file.
 */

import { createInterface } from 'node:readline'
import { Readable } from 'node:stream'
import { createGunzip } from 'node:zlib'
import type { InsertImdbRating, Tconst } from '@root/types/imdb.types.js'
import { IMDB_RATINGS_URL } from '@root/types/imdb.types.js'
import type { DatabaseService } from '@services/database.service.js'
import { extractTypedGuid } from '@utils/guid-handler.js'
import { createServiceLogger } from '@utils/logger.js'
import type { FastifyBaseLogger } from 'fastify'

export class ImdbService {
  private static readonly USER_AGENT =
    'Pulsarr/1.0 (+https://github.com/jamcalli/pulsarr)'

  /**
   * Extract tconst from IMDb GUID (e.g., "imdb:tt1234567" → "tt1234567")
   */
  private static toTconst(imdbGuid: string): string {
    return imdbGuid.replace(/^imdb:/, '')
  }

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
    const tconst = ImdbService.toTconst(imdbGuid)
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
    const tconst = ImdbService.toTconst(imdbGuid)
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

      // Stream gunzip and parse line-by-line to avoid loading entire file into memory
      if (!response.body) {
        throw new Error('Fetch returned no body')
      }

      const nodeBody = Readable.fromWeb(
        response.body as ReadableStream<Uint8Array>,
      )
      const gunzip = createGunzip()
      const rl = createInterface({
        input: nodeBody.pipe(gunzip),
        crlfDelay: Infinity,
      })

      const BATCH_SIZE = 10_000
      let batch: InsertImdbRating[] = []
      let lineIdx = 0
      let total = 0

      // Use transaction for atomic replacement to avoid temporary empty state
      await this.db.knex.transaction(async (trx) => {
        await trx('imdb_ratings').del()
        this.log.info('Cleared existing IMDB ratings')

        for await (const rawLine of rl) {
          const line = String(rawLine).trim()
          if (lineIdx++ === 0) continue // skip header
          if (!line) continue

          const [tconst, avgStr, votesStr] = line.split('\t')
          if (!tconst || !tconst.startsWith('tt')) continue

          const average_rating = avgStr === '\\N' ? null : parseFloat(avgStr)
          const num_votes = votesStr === '\\N' ? null : parseInt(votesStr, 10)

          // Validate rating range
          if (
            average_rating !== null &&
            (!Number.isFinite(average_rating) ||
              average_rating < 1 ||
              average_rating > 10)
          )
            continue

          // Validate votes count
          if (
            num_votes !== null &&
            (!Number.isFinite(num_votes) || num_votes < 0)
          )
            continue

          batch.push({ tconst: tconst as Tconst, average_rating, num_votes })

          if (batch.length >= BATCH_SIZE) {
            await this.db.insertImdbRatings(batch, trx)
            total += batch.length
            this.log.debug(`Processed ${total} IMDB ratings`)
            batch = []
          }
        }

        // Insert final batch
        if (batch.length) {
          await this.db.insertImdbRatings(batch, trx)
          total += batch.length
        }
      })

      if (total === 0) {
        this.log.warn('No IMDB ratings found in TSV, skipping database update')
        return { count: 0, updated: false }
      }

      this.log.info(`Processed ${total} IMDB rating entries via streaming`)

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
