import type { ConfigDocument } from '@services/database/config-store.js'
import type { Knex } from 'knex'

/** Returns the raw stored config document, without defaults filled in. */
export async function readConfigSettings(
  knex: Knex,
): Promise<Partial<ConfigDocument>> {
  const row = await knex('configs').where({ id: 1 }).first('settings')
  return JSON.parse(row?.settings ?? '{}') as Partial<ConfigDocument>
}

/** Replaces top-level keys of the stored config document before the app boots. */
export async function patchConfigSettings(
  knex: Knex,
  patch: Partial<ConfigDocument>,
): Promise<void> {
  const settings = { ...(await readConfigSettings(knex)), ...patch }
  await knex('configs')
    .where({ id: 1 })
    .update({ settings: JSON.stringify(settings) })
}
