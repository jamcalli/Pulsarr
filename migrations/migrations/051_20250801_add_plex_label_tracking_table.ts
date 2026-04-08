import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  const isPostgres = knex.client.config.client === 'pg'

  if (isPostgres) {
    await knex.raw(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plex_content_type') THEN
          CREATE TYPE plex_content_type AS ENUM ('movie', 'show');
        END IF;
      END$$;
    `)
  }

  await knex.schema.createTable('plex_label_tracking', (table) => {
    table.increments('id').primary()

    // Track by content GUIDs + user instead of watchlist_id to avoid FK constraints on a volatile table
    if (isPostgres) {
      table.specificType('content_guids', 'jsonb').notNullable()
    } else {
      table.json('content_guids').notNullable()
    }

    if (isPostgres) {
      table.specificType('content_type', 'plex_content_type').notNullable()
    } else {
      table.enum('content_type', ['movie', 'show']).notNullable()
    }
    table
      .integer('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE')

    table.string('plex_rating_key', 50).notNullable()

    if (isPostgres) {
      table
        .specificType('labels_applied', 'jsonb')
        .notNullable()
        .defaultTo(knex.raw("'[]'::jsonb"))
    } else {
      table.json('labels_applied').notNullable().defaultTo('[]')
    }

    table.timestamp('synced_at').defaultTo(knex.fn.now())

    table.index(['user_id'])
    table.index(['plex_rating_key'])
    table.index(['synced_at'])
    table.index(['content_type'])
  })

  // PostgreSQL can't create unique constraints on JSON columns directly, so use an MD5 functional index
  if (isPostgres) {
    await knex.raw(`
      CREATE UNIQUE INDEX plex_label_tracking_content_unique 
      ON plex_label_tracking(md5(content_guids::text), user_id, content_type)
    `)
  } else {
    await knex.schema.alterTable('plex_label_tracking', (table) => {
      table.unique(['content_guids', 'user_id', 'content_type'])
    })
  }
}

export async function down(knex: Knex): Promise<void> {
  const isPostgres = knex.client.config.client === 'pg'

  if (isPostgres) {
    await knex.raw(`
      DROP INDEX IF EXISTS plex_label_tracking_content_unique
    `)
  }

  await knex.schema.dropTableIfExists('plex_label_tracking')

  if (isPostgres) {
    await knex.raw(`
      DROP TYPE IF EXISTS plex_content_type CASCADE;
    `)
  }
}
