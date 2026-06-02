// Mock native-webhook and the webhook payload schema to avoid a transitive
// import of webhook-payloads.schema.ts, which triggers a known Bun + Vite SSR
// transform bug with Zod
// See: https://github.com/oven-sh/bun/issues/21614
vi.mock('@services/notifications/channels/native-webhook.js', () => ({
  dispatchWebhooks: vi.fn().mockResolvedValue({ succeeded: 0, failed: 0 }),
}))
vi.mock('@root/schemas/webhooks/webhook-payloads.schema.js', () => ({
  buildRoutedToItem: vi.fn(),
}))

import type { Friend } from '@root/types/plex.types.js'
import type { DatabaseService } from '@services/database.service.js'
import type { AppriseService } from '@services/notifications/channels/apprise.service.js'
import type { DiscordWebhookService } from '@services/notifications/channels/discord-webhook.service.js'
import type { DiscordBotService } from '@services/notifications/discord-bot/bot.service.js'
import {
  sendWatchlistAdded,
  type WatchlistAddedDeps,
  type WatchlistItemInfo,
} from '@services/notifications/orchestration/watchlist-added.js'
import { clearUserCanSyncCache } from '@services/plex-watchlist/users/permissions.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

function createDeps(watchlistAddNotify: string) {
  const db = {
    getUser: vi.fn().mockResolvedValue({ can_sync: true }),
    getPrimaryUser: vi
      .fn()
      .mockResolvedValue({ discord_id: '111111111111111111' }),
    createNotificationRecord: vi.fn().mockResolvedValue(undefined),
  } as unknown as DatabaseService

  const discordWebhook = {
    sendMediaNotification: vi.fn().mockResolvedValue(true),
  } as unknown as DiscordWebhookService

  const discordBot = {
    sendDirectMessageEmbed: vi.fn().mockResolvedValue(true),
  } as unknown as DiscordBotService

  const apprise = {
    isEnabled: vi.fn().mockReturnValue(true),
    sendWatchlistAdditionNotification: vi.fn().mockResolvedValue(true),
  } as unknown as AppriseService

  const deps: WatchlistAddedDeps = {
    db,
    logger: createMockLogger(),
    discordBot,
    discordWebhook,
    apprise,
    config: { watchlistAddNotify },
  }

  return { deps, db, discordWebhook, discordBot, apprise }
}

const USER: Friend & { userId: number } = {
  userId: 1,
  username: 'alice',
  watchlistId: 'wl-1',
}

const ITEM: WatchlistItemInfo = {
  id: 42,
  title: 'Night of the Living Dead',
  type: 'movie',
  guids: ['tmdb:10331'],
}

describe('sendWatchlistAdded channel gating', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearUserCanSyncCache()
  })

  it('sends only the webhook when set to webhook-only', async () => {
    const { deps, discordWebhook, discordBot, apprise } =
      createDeps('webhook-only')

    const result = await sendWatchlistAdded(deps, USER, ITEM)

    expect(result).toBe(true)
    expect(discordWebhook.sendMediaNotification).toHaveBeenCalledTimes(1)
    expect(discordBot.sendDirectMessageEmbed).not.toHaveBeenCalled()
    expect(apprise.sendWatchlistAdditionNotification).not.toHaveBeenCalled()
  })

  it('sends an admin DM to the primary user when set to dm-only', async () => {
    const { deps, db, discordWebhook, discordBot, apprise } =
      createDeps('dm-only')

    const result = await sendWatchlistAdded(deps, USER, ITEM)

    expect(result).toBe(true)
    expect(db.getPrimaryUser).toHaveBeenCalledTimes(1)
    expect(discordBot.sendDirectMessageEmbed).toHaveBeenCalledWith(
      '111111111111111111',
      expect.objectContaining({
        title: 'Night of the Living Dead',
        description: expect.stringContaining('New Movie Added'),
        footer: expect.objectContaining({ text: 'Added by alice' }),
      }),
    )
    expect(discordWebhook.sendMediaNotification).not.toHaveBeenCalled()
    expect(apprise.sendWatchlistAdditionNotification).not.toHaveBeenCalled()
  })

  it('prefers the adder alias over username in the DM footer', async () => {
    const { deps, db, discordBot } = createDeps('dm-only')
    vi.mocked(db.getUser).mockResolvedValue({
      can_sync: true,
      alias: 'AliceAlias',
    } as unknown as Awaited<ReturnType<DatabaseService['getUser']>>)

    await sendWatchlistAdded(deps, USER, ITEM)

    expect(discordBot.sendDirectMessageEmbed).toHaveBeenCalledWith(
      '111111111111111111',
      expect.objectContaining({
        footer: expect.objectContaining({ text: 'Added by AliceAlias' }),
      }),
    )
  })

  it('sends only apprise when set to apprise-only', async () => {
    const { deps, discordWebhook, discordBot, apprise } =
      createDeps('apprise-only')

    await sendWatchlistAdded(deps, USER, ITEM)

    expect(apprise.sendWatchlistAdditionNotification).toHaveBeenCalledTimes(1)
    expect(discordWebhook.sendMediaNotification).not.toHaveBeenCalled()
    expect(discordBot.sendDirectMessageEmbed).not.toHaveBeenCalled()
  })

  it('sends webhook, DM, and apprise when set to all', async () => {
    const { deps, discordWebhook, discordBot, apprise } = createDeps('all')

    await sendWatchlistAdded(deps, USER, ITEM)

    expect(discordWebhook.sendMediaNotification).toHaveBeenCalledTimes(1)
    expect(discordBot.sendDirectMessageEmbed).toHaveBeenCalledTimes(1)
    expect(apprise.sendWatchlistAdditionNotification).toHaveBeenCalledTimes(1)
  })

  it('skips all Discord and Apprise channels when set to none', async () => {
    const { deps, discordWebhook, discordBot, apprise } = createDeps('none')

    await sendWatchlistAdded(deps, USER, ITEM)

    expect(discordWebhook.sendMediaNotification).not.toHaveBeenCalled()
    expect(discordBot.sendDirectMessageEmbed).not.toHaveBeenCalled()
    expect(apprise.sendWatchlistAdditionNotification).not.toHaveBeenCalled()
  })

  it('records the DM as a Discord send in notification history', async () => {
    const { deps, db } = createDeps('dm-only')

    await sendWatchlistAdded(deps, USER, ITEM)

    expect(db.createNotificationRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'watchlist_add',
        sent_to_discord: true,
      }),
    )
  })
})
