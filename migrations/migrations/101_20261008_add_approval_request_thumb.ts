import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('approval_requests', (table) => {
    table.string('thumb').nullable()
  })

  await knex.raw(`
    UPDATE approval_requests
    SET thumb = (
      SELECT w.thumb FROM watchlist_items w
      WHERE w.key = approval_requests.content_key
        AND w.thumb IS NOT NULL
        AND w.thumb <> ''
      ORDER BY CASE WHEN w.user_id = approval_requests.user_id THEN 0 ELSE 1 END, w.id
      LIMIT 1
    )
    WHERE thumb IS NULL
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('approval_requests', (table) => {
    table.dropColumn('thumb')
  })
}
