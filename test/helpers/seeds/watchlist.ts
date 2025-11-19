import type { Knex } from 'knex'

/**
 * Seed data for watchlist_items table
 * Synthetic test data using well-known public movies and TV shows
 *
 * Schema reference:
 * - id: integer (primary key)
 * - user_id: integer (not null, foreign key to users.id)
 * - title: string (not null)
 * - key: string (not null) - Unique identifier from Plex
 * - type: string (not null) - 'movie' or 'show'
 * - thumb: string (nullable) - Poster URL
 * - added: string (nullable) - ISO timestamp
 * - guids: jsonb (default: '[]') - Array of external IDs
 * - genres: jsonb (default: '[]') - Array of genres
 * - status: enum (default: 'pending') - 'pending', 'requested', 'grabbed', 'notified'
 * - last_notified_at: timestamp (nullable)
 * - series_status: enum (nullable) - 'continuing', 'ended'
 * - movie_status: enum (nullable)
 * - sonarr_instance_id: integer (nullable, foreign key)
 * - radarr_instance_id: integer (nullable, foreign key)
 * - created_at: timestamp
 * - updated_at: timestamp
 *
 * Note: user_id + key must be unique
 */
export const SEED_WATCHLIST_ITEMS = [
  // Night of the Living Dead (1968)
  {
    id: 1,
    user_id: 1,
    title: 'Night of the Living Dead',
    key: '5d77683585719b001f3a3946',
    type: 'movie',
    thumb:
      'https://metadata-static.plex.tv/0/gracenote/0369b3f2cab51684b04d52828268d08f.jpg',
    added: '2025-05-21T18:34:07Z',
    guids: JSON.stringify(['imdb:tt0063350', 'tmdb:10331', 'tvdb:1831']),
    genres: JSON.stringify(['Horror', 'Thriller']),
    status: 'grabbed',
    last_notified_at: null,
    series_status: null,
    movie_status: 'available',
    sonarr_instance_id: null,
    radarr_instance_id: null,
  },

  // Nosferatu (2024)
  {
    id: 2,
    user_id: 1,
    title: 'Nosferatu',
    key: '5d776c8cad5437001f7c17f0',
    type: 'movie',
    thumb:
      'https://metadata-static.plex.tv/b/gracenote/b92a7759185b25342b6a7224406f0c7f.jpg',
    added: '2024-12-03T06:45:11Z',
    guids: JSON.stringify(['imdb:tt5040012', 'tmdb:426063', 'tvdb:59698']),
    genres: JSON.stringify(['Horror', 'Fantasy', 'Mystery', 'Drama']),
    status: 'grabbed',
    last_notified_at: null,
    series_status: null,
    movie_status: 'available',
    sonarr_instance_id: null,
    radarr_instance_id: null,
  },

  // Metropolis (1927)
  {
    id: 3,
    user_id: 1,
    title: 'Metropolis',
    key: '5d776824e6d55c002040ae63',
    type: 'movie',
    thumb:
      'https://metadata-static.plex.tv/4/gracenote/46692ad1eb706e6d8a3b58f18b4575ed.jpg',
    added: '2024-12-01T23:24:07Z',
    guids: JSON.stringify(['imdb:tt0017136', 'tmdb:19', 'tvdb:2006']),
    genres: JSON.stringify(['Drama', 'Science Fiction']),
    status: 'grabbed',
    last_notified_at: null,
    series_status: null,
    movie_status: 'available',
    sonarr_instance_id: null,
    radarr_instance_id: null,
  },

  // It's a Wonderful Life (1946)
  {
    id: 4,
    user_id: 1,
    title: "It's a Wonderful Life",
    key: '5d776829103a2d001f564e3b',
    type: 'movie',
    thumb:
      'https://metadata-static.plex.tv/5/gracenote/5e382dfb7014b01cb54d34e74edb8039.jpg',
    added: '2024-12-01T23:24:06Z',
    guids: JSON.stringify(['imdb:tt0038650', 'tmdb:1585', 'tvdb:771']),
    genres: JSON.stringify(['Drama', 'Family', 'Fantasy', 'Romance']),
    status: 'grabbed',
    last_notified_at: null,
    series_status: null,
    movie_status: 'available',
    sonarr_instance_id: null,
    radarr_instance_id: null,
  },

  // Casablanca (1942)
  {
    id: 5,
    user_id: 1,
    title: 'Casablanca',
    key: '5d776824103a2d001f5639b1',
    type: 'movie',
    thumb:
      'https://metadata-static.plex.tv/4/gracenote/4ad6c17f86a69f50f61b2a9e8a28c541.jpg',
    added: '2024-12-01T23:24:00Z',
    guids: JSON.stringify(['imdb:tt0034583', 'tmdb:289', 'tvdb:1762']),
    genres: JSON.stringify(['Drama', 'Romance', 'War']),
    status: 'grabbed',
    last_notified_at: null,
    series_status: null,
    movie_status: 'available',
    sonarr_instance_id: null,
    radarr_instance_id: null,
  },

  // Sherlock (BBC)
  {
    id: 6,
    user_id: 1,
    title: 'Sherlock',
    key: '5d9c08452df347001e3ae964',
    type: 'show',
    thumb:
      'https://image.tmdb.org/t/p/original/cIfGAkpvWD2zxHrXzhv3uptYbyV.jpg',
    added: '2024-07-27T20:43:18Z',
    guids: JSON.stringify(['imdb:tt1475582', 'tmdb:19885', 'tvdb:176941']),
    genres: JSON.stringify([
      'Crime',
      'Drama',
      'Mystery',
      'Thriller',
      'Suspense',
    ]),
    status: 'grabbed',
    last_notified_at: null,
    series_status: 'ended',
    movie_status: null,
    sonarr_instance_id: null,
    radarr_instance_id: null,
  },

  // Star Trek: Lower Decks
  {
    id: 7,
    user_id: 1,
    title: 'Star Trek: Lower Decks',
    key: '5d9c091b02391c001f595877',
    type: 'show',
    thumb:
      'https://image.tmdb.org/t/p/original/i7Em3r7KCyNfkOwMkyqN8UMvK8S.jpg',
    added: '2024-11-20T01:56:34Z',
    guids: JSON.stringify(['imdb:tt9184820', 'tmdb:85948', 'tvdb:367138']),
    genres: JSON.stringify([
      'Animation',
      'Comedy',
      'Action',
      'Adventure',
      'Science Fiction',
      'Sci-Fi & Fantasy',
    ]),
    status: 'grabbed',
    last_notified_at: null,
    series_status: 'ended',
    movie_status: null,
    sonarr_instance_id: null,
    radarr_instance_id: null,
  },
]

/**
 * Seeds the watchlist_items table
 */
export async function seedWatchlist(knex: Knex): Promise<void> {
  await knex('watchlist_items').insert(SEED_WATCHLIST_ITEMS)

  // Update sqlite_sequence to ensure future auto-increments start after our seed data
  if (SEED_WATCHLIST_ITEMS.length > 0) {
    const maxId = Math.max(...SEED_WATCHLIST_ITEMS.map((item) => item.id))
    await knex.raw(
      `INSERT OR REPLACE INTO sqlite_sequence (name, seq) VALUES ('watchlist_items', ?)`,
      [maxId],
    )
  }
}
