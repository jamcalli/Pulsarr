import type { Knex } from 'knex'
import { isPostgreSQL } from '../utils/clientDetection.js'

// Postgres only: its unique index treats NULL user_ids as distinct, SQLite's upsert already finds the NULL row first
export async function up(knex: Knex): Promise<void> {
  if (!isPostgreSQL(knex)) return

  // The surviving row takes every label the group tracked, or Pulsarr would forget labels it wrote
  await knex.raw(`
    UPDATE plex_label_tracking AS p
    SET labels_applied = m.labels, synced_at = m.synced
    FROM (
      SELECT
        MAX(t.id) AS keep_id,
        COALESCE(
          jsonb_agg(DISTINCT l.value) FILTER (WHERE l.value IS NOT NULL),
          '[]'::jsonb
        ) AS labels,
        MAX(t.synced_at) AS synced
      FROM plex_label_tracking t
      LEFT JOIN LATERAL jsonb_array_elements_text(t.labels_applied) AS l(value) ON true
      GROUP BY md5(t.content_guids::text), COALESCE(t.user_id, -1), t.content_type, t.plex_rating_key
      HAVING COUNT(DISTINCT t.id) > 1
    ) AS m
    WHERE p.id = m.keep_id
  `)

  await knex.raw(`
    DELETE FROM plex_label_tracking
    WHERE id NOT IN (
      SELECT MAX(id)
      FROM plex_label_tracking
      GROUP BY md5(content_guids::text), COALESCE(user_id, -1), content_type, plex_rating_key
    )
  `)

  await knex.raw('DROP INDEX IF EXISTS plex_label_tracking_content_unique')
  await knex.raw(`
    CREATE UNIQUE INDEX plex_label_tracking_content_unique
    ON plex_label_tracking(md5(content_guids::text), COALESCE(user_id, -1), content_type, plex_rating_key)
  `)
}

export async function down(knex: Knex): Promise<void> {
  if (!isPostgreSQL(knex)) return

  await knex.raw('DROP INDEX IF EXISTS plex_label_tracking_content_unique')
  await knex.raw(`
    CREATE UNIQUE INDEX plex_label_tracking_content_unique
    ON plex_label_tracking(md5(content_guids::text), user_id, content_type, plex_rating_key)
  `)
}
