import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('radarr_instances', (table) => {
    table.boolean('skip_default_routing_when_no_match').defaultTo(false)
  })

  await knex.schema.alterTable('sonarr_instances', (table) => {
    table.boolean('skip_default_routing_when_no_match').defaultTo(false)
  })

  // Preserve the global flag from migration 095 on the default instances
  // before dropping the configs column.
  const config = await knex('configs')
    .select('skipDefaultRoutingWhenNoMatch')
    .first()
  const skipDefault = Boolean(config?.skipDefaultRoutingWhenNoMatch)

  if (skipDefault) {
    await knex('radarr_instances')
      .where('is_default', true)
      .update({ skip_default_routing_when_no_match: true })
    await knex('sonarr_instances')
      .where('is_default', true)
      .update({ skip_default_routing_when_no_match: true })
  }

  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('skipDefaultRoutingWhenNoMatch')
  })
}

export async function down(knex: Knex): Promise<void> {
  // Inspect per-instance values before dropping columns. Collapse to the
  // single global flag with a deterministic policy: true if any instance
  // had skip enabled (preserves skip intent; false only when all were off).
  const radarrFlags = await knex('radarr_instances').select(
    'skip_default_routing_when_no_match',
  )
  const sonarrFlags = await knex('sonarr_instances').select(
    'skip_default_routing_when_no_match',
  )
  const skipDefault = [...radarrFlags, ...sonarrFlags].some((row) =>
    Boolean(row.skip_default_routing_when_no_match),
  )

  await knex.schema.alterTable('configs', (table) => {
    table.boolean('skipDefaultRoutingWhenNoMatch').defaultTo(false)
  })

  if (skipDefault) {
    await knex('configs').update({ skipDefaultRoutingWhenNoMatch: true })
  }

  await knex.schema.alterTable('radarr_instances', (table) => {
    table.dropColumn('skip_default_routing_when_no_match')
  })

  await knex.schema.alterTable('sonarr_instances', (table) => {
    table.dropColumn('skip_default_routing_when_no_match')
  })
}
