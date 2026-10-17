import type { DeleteSyncNotifyOption } from '@root/types/config.types.js'

export type AdminChannel = 'discordWebhook' | 'discordDm' | 'apprise'

const NONE: ReadonlySet<AdminChannel> = new Set()
const ALL: ReadonlySet<AdminChannel> = new Set([
  'discordWebhook',
  'discordDm',
  'apprise',
])
const DISCORD: ReadonlySet<AdminChannel> = new Set([
  'discordWebhook',
  'discordDm',
])
const WEBHOOK: ReadonlySet<AdminChannel> = new Set(['discordWebhook'])
const DM: ReadonlySet<AdminChannel> = new Set(['discordDm'])
const APPRISE: ReadonlySet<AdminChannel> = new Set(['apprise'])

/** Covers every admin notify setting, legacy delete sync values included. */
export const ADMIN_CHANNELS: Record<
  DeleteSyncNotifyOption,
  ReadonlySet<AdminChannel>
> = {
  none: NONE,
  all: ALL,
  'discord-only': DISCORD,
  'discord-both': DISCORD,
  both: DISCORD,
  'apprise-only': APPRISE,
  'webhook-only': WEBHOOK,
  'discord-webhook': WEBHOOK,
  webhook: WEBHOOK,
  'dm-only': DM,
  'discord-message': DM,
  message: DM,
}
