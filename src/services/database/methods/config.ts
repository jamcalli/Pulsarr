import type { ConfigFull } from '@root/schemas/config/config.schema.js'
import {
  type PublicConfigPatch,
  SECRET_CONFIG_KEYS,
  STORED_CONFIG_KEYS,
} from '@root/schemas/config/config-defaults.js'
import type { Config, SecretColumn } from '@root/types/config.types.js'
import {
  type ConfigDocument,
  pickStoredKeys,
  readInternalSettings,
  readStoredSettings,
  settingsAssignment,
} from '@services/database/config-store.js'
import type { DatabaseService } from '@services/database.service.js'

/** Fills defaults for every stored key that is missing, null or empty. */
export async function getConfig(
  this: DatabaseService,
): Promise<ConfigFull | undefined> {
  const row = await this.knex('configs').where({ id: 1 }).first()
  if (!row) return undefined

  return {
    ...readStoredSettings(row.settings),
    id: row.id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

/** Throws when a config row already exists, since only row id 1 may exist. */
export async function createConfig(
  this: DatabaseService,
  config: Config,
): Promise<number> {
  const exists = await this.knex('configs').count('* as c').first()
  if (Number(exists?.c) > 0) {
    throw new Error('Configuration already exists, use updateConfig instead')
  }

  const settings = {
    ...pickStoredKeys(config, STORED_CONFIG_KEYS),
    ...pickStoredKeys(config, SECRET_CONFIG_KEYS),
  }

  const result = await this.knex('configs')
    .insert({
      id: 1,
      settings: JSON.stringify(settings),
      created_at: this.timestamp,
      updated_at: this.timestamp,
    })
    .returning('id')

  const id = this.extractId(result)
  this.log.debug(`Config created with ID: ${id}`)
  return id
}

async function writeSettings(
  db: DatabaseService,
  patch: Partial<ConfigDocument>,
): Promise<number> {
  const settings = settingsAssignment(db.knex, patch, db.isPostgres)
  return db
    .knex('configs')
    .where({ id: 1 })
    .update({
      ...(settings && { settings }),
      updated_at: db.timestamp,
    })
}

async function readSettingsColumn(db: DatabaseService): Promise<string | null> {
  const row = await db.knex('configs').where({ id: 1 }).first('settings')
  return row?.settings ?? null
}

/** Silently drops keys that are not public stored keys, and returns false only when the row is missing or the query fails. */
export async function updateConfig(
  this: DatabaseService,
  patch: PublicConfigPatch,
): Promise<boolean> {
  try {
    const updated = await writeSettings(
      this,
      pickStoredKeys(patch, STORED_CONFIG_KEYS),
    )
    return updated > 0
  } catch (error) {
    this.log.error({ error }, 'Error updating config:')
    return false
  }
}

/** Returns null when no update notification was ever sent, the row is missing, or the read fails. */
export async function getLastNotifiedVersion(
  this: DatabaseService,
): Promise<string | null> {
  try {
    const raw = await readSettingsColumn(this)
    return raw === null ? null : readInternalSettings(raw).lastNotifiedVersion
  } catch (error) {
    this.log.error({ error }, 'Error reading lastNotifiedVersion')
    return null
  }
}

/** Bypasses the public key filter on purpose so the public config API cannot set this field. */
export async function setLastNotifiedVersion(
  this: DatabaseService,
  version: string,
): Promise<boolean> {
  try {
    const updated = await writeSettings(this, { lastNotifiedVersion: version })
    return updated > 0
  } catch (error) {
    this.log.error({ error, version }, 'Error setting lastNotifiedVersion')
    return false
  }
}

/** Throws so boot aborts instead of overwriting a stored secret, and each field is null when unset. */
export async function getSecrets(
  this: DatabaseService,
): Promise<Record<SecretColumn, string | null>> {
  const raw = await readSettingsColumn(this)
  const stored = raw === null ? null : readInternalSettings(raw)
  return {
    cookieSecret: stored?.cookieSecret ?? null,
    webhookSecret: stored?.webhookSecret ?? null,
    maintainerrWebhookSecret: stored?.maintainerrWebhookSecret ?? null,
  }
}

/** Bypasses the public key filter on purpose and throws when the config row is missing. */
export async function setSecret(
  this: DatabaseService,
  key: SecretColumn,
  value: string,
): Promise<void> {
  const updated = await writeSettings(this, { [key]: value })
  if (updated === 0) {
    throw new Error(`Failed to persist ${key}: config row missing`)
  }
}
