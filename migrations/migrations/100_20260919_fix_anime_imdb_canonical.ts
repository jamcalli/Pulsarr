import type { Knex } from 'knex'

// IMDb ids were stored without the 'tt' prefix but with padding kept ('0094625'); canonical is 'tt0094625'
export async function up(knex: Knex): Promise<void> {
  await knex('anime_ids')
    .where('source', 'imdb')
    .whereNot('external_id', 'like', 'tt%')
    .update({ external_id: knex.raw("'tt' || external_id") })
}

export async function down(knex: Knex): Promise<void> {
  await knex('anime_ids')
    .where('source', 'imdb')
    .where('external_id', 'like', 'tt%')
    .update({ external_id: knex.raw('substr(external_id, 3)') })
}
