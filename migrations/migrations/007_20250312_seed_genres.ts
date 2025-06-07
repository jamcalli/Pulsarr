import type { Knex } from 'knex'
import {
  shouldSkipForPostgreSQL,
  shouldSkipDownForPostgreSQL,
} from '../utils/clientDetection.js'

/**
 * Seeds the `genres` table with a predefined list of genre names, inserting only those that do not already exist.
 *
 * Skips execution if running on PostgreSQL, as determined by {@link shouldSkipForPostgreSQL}.
 *
 * @remark
 * Genres are inserted in batches of 10. If all genres already exist, no changes are made.
 */
export async function up(knex: Knex): Promise<void> {
  if (shouldSkipForPostgreSQL(knex, '007_20250312_seed_genres')) {
    return
  }
  const existingGenres = await knex('genres').select('name')
  const existingGenreNames = existingGenres.map((g) => g.name)

  const genres = [
    { name: 'Action' },
    { name: 'Action/Adventure' },
    { name: 'Adventure' },
    { name: 'Animation' },
    { name: 'Anime' },
    { name: 'Biography' },
    { name: 'Children' },
    { name: 'Comedy' },
    { name: 'Crime' },
    { name: 'Documentary' },
    { name: 'Drama' },
    { name: 'Family' },
    { name: 'Fantasy' },
    { name: 'Food' },
    { name: 'Game Show' },
    { name: 'History' },
    { name: 'Home and Garden' },
    { name: 'Horror' },
    { name: 'Indie' },
    { name: 'Martial Arts' },
    { name: 'Mini-Series' },
    { name: 'Music' },
    { name: 'Musical' },
    { name: 'Mystery' },
    { name: 'News' },
    { name: 'Reality' },
    { name: 'Romance' },
    { name: 'Sci-Fi & Fantasy' },
    { name: 'Science Fiction' },
    { name: 'Short' },
    { name: 'Soap' },
    { name: 'Sport' },
    { name: 'Suspense' },
    { name: 'TV Movie' },
    { name: 'Talk' },
    { name: 'Talk Show' },
    { name: 'Thriller' },
    { name: 'Travel' },
    { name: 'War' },
    { name: 'War & Politics' },
    { name: 'Western' },
  ]

  const genresToInsert = genres.filter(
    (g) => !existingGenreNames.includes(g.name),
  )

  if (genresToInsert.length > 0) {
    const batchSize = 10
    for (let i = 0; i < genresToInsert.length; i += batchSize) {
      const batch = genresToInsert.slice(i, i + batchSize)
      await knex('genres').insert(batch)
    }

    console.log(`Seeded ${genresToInsert.length} genres`)
  } else {
    console.log('No new genres to seed')
  }
}

/**
 * Reverts the genre seeding by removing specific genres from the database.
 *
 * Deletes all entries in the `genres` table whose names match the list of genres added by the corresponding `up` migration.
 *
 * @remark
 * This operation is skipped when running on PostgreSQL.
 */
export async function down(knex: Knex): Promise<void> {
  if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
  // List of genres that were added by this migration
  const genresToRemove = [
    'Action',
    'Action/Adventure',
    'Adventure',
    'Animation',
    'Anime',
    'Biography',
    'Children',
    'Comedy',
    'Crime',
    'Documentary',
    'Drama',
    'Family',
    'Fantasy',
    'Food',
    'Game Show',
    'History',
    'Home and Garden',
    'Horror',
    'Indie',
    'Martial Arts',
    'Mini-Series',
    'Music',
    'Musical',
    'Mystery',
    'News',
    'Reality',
    'Romance',
    'Sci-Fi & Fantasy',
    'Science Fiction',
    'Short',
    'Soap',
    'Sport',
    'Suspense',
    'TV Movie',
    'Talk',
    'Talk Show',
    'Thriller',
    'Travel',
    'War',
    'War & Politics',
    'Western',
  ]

  // Remove the genres added by this migration
  await knex('genres').whereIn('name', genresToRemove).delete()
}
