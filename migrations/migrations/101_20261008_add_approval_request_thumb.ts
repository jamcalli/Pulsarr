import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('approval_requests', (table) => {
    table.string('thumb').nullable()
  })

  await knex('approval_requests')
    .whereNull('thumb')
    .update({
      thumb: knex('watchlist_items as w')
        .select('w.thumb')
        .where('w.key', knex.ref('approval_requests.content_key'))
        .whereNotNull('w.thumb')
        .whereNot('w.thumb', '')
        .orderByRaw(
          'CASE WHEN w.user_id = approval_requests.user_id THEN 0 ELSE 1 END',
        )
        .orderBy('w.id')
        .limit(1),
    })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('approval_requests', (table) => {
    table.dropColumn('thumb')
  })
}
