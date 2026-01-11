import type { Knex } from 'knex'
import { isPostgreSQL } from '../utils/clientDetection.js'

/**
 * Normalizes poster paths in watchlist_items to store only the TMDB path component.
 *
 * Before: https://image.tmdb.org/t/p/original/abc123.jpg
 * After:  /abc123.jpg
 *
 * Non-TMDB URLs (Plex metadata) are left unchanged as they don't support size parameters.
 *
 * This allows building context-appropriate sized URLs at render time:
 * - Cards: w300_and_h450_face (~20-40KB)
 * - Notifications: w600_and_h900_bestv2 (~50-100KB)
 *
 * @see https://developer.themoviedb.org/docs/image-basics
 */
export async function up(knex: Knex): Promise<void> {
  const tableExists = await knex.schema.hasTable('watchlist_items')
  if (!tableExists) {
    return
  }

  if (isPostgreSQL(knex)) {
    // PostgreSQL: Use efficient regex_replace in a single UPDATE
    // Pattern extracts the path portion after /t/p/{size}/
    await knex.raw(`
      UPDATE watchlist_items
      SET thumb = regexp_replace(thumb, '^https?://image\\.tmdb\\.org/t/p/[^/]+', '')
      WHERE thumb LIKE 'https://image.tmdb.org/t/p/%'
         OR thumb LIKE 'http://image.tmdb.org/t/p/%'
    `)
  } else {
    // SQLite: Fetch all matching IDs first, then batch process
    // SQLite lacks regex_replace so we must process in application code
    const tmdbPattern = /^https?:\/\/image\.tmdb\.org\/t\/p\/[^/]+(\/.+)$/

    const items = await knex('watchlist_items')
      .select('id', 'thumb')
      .where('thumb', 'like', 'https://image.tmdb.org/t/p/%')
      .orWhere('thumb', 'like', 'http://image.tmdb.org/t/p/%')

    // Build update map
    const updates: Array<{ id: number; newThumb: string }> = []
    for (const item of items) {
      const match = item.thumb?.match(tmdbPattern)
      if (match) {
        updates.push({ id: item.id, newThumb: match[1] })
      }
    }

    // Batch update in chunks (matches established pattern)
    const chunkSize = 50
    for (let i = 0; i < updates.length; i += chunkSize) {
      const chunk = updates.slice(i, i + chunkSize)
      await knex.transaction(async (trx) => {
        for (const { id, newThumb } of chunk) {
          await trx('watchlist_items')
            .where('id', id)
            .update({ thumb: newThumb })
        }
      })
    }
  }
}

/**
 * Reverts normalized paths back to full TMDB URLs with 'original' size.
 *
 * Note: This uses 'original' size which may not match the original URL's size,
 * but maintains functionality. The optimization benefit is lost.
 */
export async function down(knex: Knex): Promise<void> {
  const tableExists = await knex.schema.hasTable('watchlist_items')
  if (!tableExists) {
    return
  }

  if (isPostgreSQL(knex)) {
    // PostgreSQL: Single UPDATE with concat
    await knex.raw(`
      UPDATE watchlist_items
      SET thumb = 'https://image.tmdb.org/t/p/original' || thumb
      WHERE thumb LIKE '/%'
        AND thumb NOT LIKE 'http%'
    `)
  } else {
    // SQLite: Fetch all matching IDs first, then batch process
    const items = await knex('watchlist_items')
      .select('id', 'thumb')
      .where('thumb', 'like', '/%')
      .whereNot('thumb', 'like', 'http%')

    // Build update list
    const updates: Array<{ id: number; newThumb: string }> = []
    for (const item of items) {
      if (item.thumb?.startsWith('/')) {
        updates.push({
          id: item.id,
          newThumb: `https://image.tmdb.org/t/p/original${item.thumb}`,
        })
      }
    }

    // Batch update in chunks
    const chunkSize = 50
    for (let i = 0; i < updates.length; i += chunkSize) {
      const chunk = updates.slice(i, i + chunkSize)
      await knex.transaction(async (trx) => {
        for (const { id, newThumb } of chunk) {
          await trx('watchlist_items')
            .where('id', id)
            .update({ thumb: newThumb })
        }
      })
    }
  }
}
