import type { Config } from '@root/types/config.types.js'
import type { NotificationDeps } from '@services/notifications/types.js'
import { vi } from 'vitest'
import { createMockLogger } from './logger.js'
import { createMockUser } from './user.js'

export const ADMIN_DISCORD_ID = '111111111111111111'
export const ADMIN_WEBHOOK_URL = 'https://discord.com/webhook/test'
export const SYSTEM_APPRISE_URL = 'tgram://system/chat'

/** Every channel delivers and the primary user has a Discord ID unless a test overrides the fakes. */
export function createNotificationDeps(config: Partial<Config> = {}) {
  const db = {
    getPrimaryUser: vi.fn().mockResolvedValue(
      createMockUser(1, 'admin', {
        is_primary_token: true,
        discord_id: ADMIN_DISCORD_ID,
      }),
    ),
    getUser: vi.fn().mockResolvedValue(createMockUser(1, 'admin')),
    getUsersByIds: vi.fn().mockResolvedValue([]),
    getWatchlistItemsByKeys: vi.fn().mockResolvedValue([]),
    createNotificationRecord: vi.fn().mockResolvedValue(1),
    getWebhookEndpointsForEvent: vi.fn().mockResolvedValue([]),
  }
  const discordBot = {
    sendNotification: vi.fn().mockResolvedValue({ ok: true }),
  }
  const discordWebhook = {
    sendNotification: vi.fn().mockResolvedValue({ ok: true }),
  }
  const apprise = { sendNotification: vi.fn().mockResolvedValue({ ok: true }) }

  const deps = {
    db,
    logger: createMockLogger(),
    progress: { emit: vi.fn() },
    config: {
      discordWebhookUrl: ADMIN_WEBHOOK_URL,
      systemAppriseUrl: SYSTEM_APPRISE_URL,
      ...config,
    },
    discordBot,
    discordWebhook,
    apprise,
    plexMobile: { isEnabled: vi.fn().mockReturnValue(false) },
    detach: vi.fn(),
  } as unknown as NotificationDeps

  return { deps, db, discordBot, discordWebhook, apprise }
}
