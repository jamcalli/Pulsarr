import type { Knex } from 'knex'
import {
  shouldSkipDownForPostgreSQL,
  shouldSkipForPostgreSQL,
} from '../utils/clientDetection.js'

export async function up(knex: Knex): Promise<void> {
  if (shouldSkipForPostgreSQL(knex, '008_20250320_add_schedules')) {
    return
  }
  await knex.schema.createTable('schedules', (table) => {
    table.increments('id').primary()
    table.string('name').notNullable().unique()
    table.string('type').notNullable()
    table.json('config').notNullable()
    table.boolean('enabled').defaultTo(true)
    table.json('last_run').nullable()
    table.json('next_run').nullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())

    table.index('name')
    table.index('enabled')
  })

  await knex('schedules').insert([
    {
      name: 'delete-sync',
      type: 'cron',
      config: JSON.stringify({
        expression: '0 1 * * 0', // Every Sunday at 1:00 AM
      }),
      enabled: false,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
  ])
}

export async function down(knex: Knex): Promise<void> {
  if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
  await knex.schema.dropTable('schedules')
}
