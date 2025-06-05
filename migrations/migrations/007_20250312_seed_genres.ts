import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {

    // Skip on PostgreSQL - consolidated in migration 034
  const client = knex.client.config.client
  if (client === 'pg') {
    console.log('Skipping migration 007_20250312_seed_genres - PostgreSQL uses consolidated schema in migration 034')
    return
  }
const existingGenres = await knex('genres').select('name')
  const existingGenreNames = existingGenres.map(g => g.name)
  
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
    { name: 'Western' }
  ]
  
  const genresToInsert = genres.filter(g => !existingGenreNames.includes(g.name))
  
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

export async function down(knex: Knex): Promise<void> {
    // Skip on PostgreSQL - consolidated in migration 034
  const client = knex.client.config.client
  if (client === 'pg') {
    return
  }
  // List of genres that were added by this migration
  const genresToRemove = [
    'Action', 'Action/Adventure', 'Adventure', 'Animation', 'Anime',
    'Biography', 'Children', 'Comedy', 'Crime', 'Documentary', 'Drama',
    'Family', 'Fantasy', 'Food', 'Game Show', 'History', 'Home and Garden',
    'Horror', 'Indie', 'Martial Arts', 'Mini-Series', 'Music', 'Musical',
    'Mystery', 'News', 'Reality', 'Romance', 'Sci-Fi & Fantasy', 'Science Fiction',
    'Short', 'Soap', 'Sport', 'Suspense', 'TV Movie', 'Talk', 'Talk Show',
    'Thriller', 'Travel', 'War', 'War & Politics', 'Western'
  ]
  
  // Remove the genres added by this migration
  await knex('genres')
    .whereIn('name', genresToRemove)
    .delete()
}