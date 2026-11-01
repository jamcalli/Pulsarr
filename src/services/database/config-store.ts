import {
  INTERNAL_CONFIG_KEYS,
  type InternalConfigKey,
  STORED_CONFIG_DEFAULTS,
  STORED_CONFIG_KEYS,
  type StoredConfig,
  type StoredConfigKey,
} from '@root/schemas/config/config-defaults.js'
import type { Knex } from 'knex'

export type ConfigDocument = StoredConfig &
  Record<InternalConfigKey, string | null>

const DOCUMENT_KEYS: readonly (keyof ConfigDocument)[] = [
  ...STORED_CONFIG_KEYS,
  ...INTERNAL_CONFIG_KEYS,
]

/** Keeps only `keys` from `obj` and drops undefined values. */
export function pickStoredKeys<T extends object, K extends keyof T>(
  obj: T,
  keys: readonly K[],
): Partial<Pick<T, K>> {
  const picked: Partial<Pick<T, K>> = {}
  for (const key of keys) {
    if (obj[key] !== undefined) picked[key] = obj[key]
  }
  return picked
}

function parseDocument(raw: string): Partial<ConfigDocument> {
  return JSON.parse(raw) as Partial<ConfigDocument>
}

/** Parses the settings column and fills defaults for every key that is missing, null or empty. */
export function readStoredSettings(raw: string) {
  const doc = parseDocument(raw)
  const stored: Partial<StoredConfig> = {}
  for (const key of STORED_CONFIG_KEYS) {
    copyPresent(stored, doc, key)
  }
  const merged = { ...STORED_CONFIG_DEFAULTS, ...stored }
  return {
    ...merged,
    publicContentNotifications: {
      ...STORED_CONFIG_DEFAULTS.publicContentNotifications,
      ...stored.publicContentNotifications,
    },
    quotaSettings: {
      cleanup: {
        ...STORED_CONFIG_DEFAULTS.quotaSettings.cleanup,
        ...stored.quotaSettings?.cleanup,
      },
      weeklyRolling: {
        ...STORED_CONFIG_DEFAULTS.quotaSettings.weeklyRolling,
        ...stored.quotaSettings?.weeklyRolling,
      },
      monthly: {
        ...STORED_CONFIG_DEFAULTS.quotaSettings.monthly,
        ...stored.quotaSettings?.monthly,
      },
    },
    approvalExpiration: {
      ...STORED_CONFIG_DEFAULTS.approvalExpiration,
      ...stored.approvalExpiration,
    },
    plexLabelSync: {
      ...STORED_CONFIG_DEFAULTS.plexLabelSync,
      ...stored.plexLabelSync,
      tagSync: {
        ...STORED_CONFIG_DEFAULTS.plexLabelSync.tagSync,
        ...stored.plexLabelSync?.tagSync,
      },
    },
  }
}

function copyPresent<K extends StoredConfigKey>(
  to: Partial<StoredConfig>,
  from: Partial<ConfigDocument>,
  key: K,
): void {
  const value = from[key]
  if (value === undefined || value === null || value === '') return
  to[key] = value
}

/** Reads every internal key, each null when the document does not hold it. */
export function readInternalSettings(
  raw: string,
): Record<InternalConfigKey, string | null> {
  const doc = parseDocument(raw)
  return {
    cookieSecret: doc.cookieSecret ?? null,
    webhookSecret: doc.webhookSecret ?? null,
    maintainerrWebhookSecret: doc.maintainerrWebhookSecret ?? null,
    lastNotifiedVersion: doc.lastNotifiedVersion ?? null,
  }
}

/** Builds the atomic `settings` assignment that replaces each top-level key in `patch` whole. */
export function settingsAssignment(
  knex: Knex,
  patch: Partial<ConfigDocument>,
  isPostgres: boolean,
): Knex.Raw | undefined {
  const picked = pickStoredKeys(patch, DOCUMENT_KEYS)
  const entries = Object.entries(picked)
  if (entries.length === 0) return undefined

  if (isPostgres) {
    return knex.raw('settings || ?::jsonb', [JSON.stringify(picked)])
  }

  // json_patch is RFC 7396 and would deep-merge nested objects, so each key is set whole
  const paths = entries.map(([key]) => `'$."${key}"', json(?)`).join(', ')
  return knex.raw(
    `json_set(settings, ${paths})`,
    entries.map(([, value]) => JSON.stringify(value)),
  )
}
