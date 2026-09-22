import type { Knex } from 'knex'

// IMDb ids were stored with leading zeros ('0094625') while lookups ask for the parseInt form ('94625')
export async function up(knex: Knex): Promise<void> {
  await knex('anime_ids').truncate()
}

export async function down(_knex: Knex): Promise<void> {
  // The anime plugin repopulates the table on startup when it is empty
}
