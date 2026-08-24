import type { Knex } from 'knex'

// Child tables holding user_id, with the columns that are unique per user
const CHILD_TABLES: { table: string; keys: string[] }[] = [
  { table: 'watchlist_items', keys: ['key'] },
  { table: 'notifications', keys: [] },
  { table: 'user_quotas', keys: ['content_type'] },
  { table: 'approval_requests', keys: ['content_key'] },
  { table: 'quota_usage', keys: [] },
  {
    table: 'plex_label_tracking',
    keys: ['content_guids', 'content_type', 'plex_rating_key'],
  },
  { table: 'watchlist_exclusions', keys: ['key'] },
]

export async function up(knex: Knex): Promise<void> {
  // Same-name rows are one person inserted twice (Plex names are globally unique)
  const dupeGroups = await knex('users')
    .select('name')
    .groupBy('name')
    .havingRaw('count(*) > 1')

  for (const { name } of dupeGroups) {
    const rows = await knex('users')
      .where({ name })
      .orderBy([
        { column: 'is_primary_token', order: 'desc' },
        { column: 'id', order: 'asc' },
      ])

    const keeper = rows[0]
    const dupes = rows.slice(1)

    for (const dupe of dupes) {
      for (const { table, keys } of CHILD_TABLES) {
        if (keys.length > 0) {
          const collision = keys
            .map((k) => `c2.${k} = ${table}.${k}`)
            .join(' AND ')
          await knex.raw(
            `UPDATE ${table} SET user_id = ? WHERE user_id = ?
             AND NOT EXISTS (
               SELECT 1 FROM ${table} c2 WHERE c2.user_id = ? AND ${collision}
             )`,
            [keeper.id, dupe.id, keeper.id],
          )
          // Rows colliding with the keeper's are the same data; drop them
          await knex(table).where({ user_id: dupe.id }).delete()
        } else {
          await knex(table)
            .where({ user_id: dupe.id })
            .update({ user_id: keeper.id })
        }
      }

      await knex('users').where({ id: dupe.id }).delete()
    }
  }

  await knex.schema.alterTable('users', (table) => {
    table.unique(['name'])
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.dropUnique(['name'])
  })
}
