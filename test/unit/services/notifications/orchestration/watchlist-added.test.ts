vi.mock('@services/notifications/channels/native-webhook.js', () => ({
  dispatchWebhooks: vi
    .fn()
    .mockResolvedValue({ dispatched: 0, succeeded: 0, failed: 0, results: [] }),
}))

import type { NotifyOption } from '@root/types/config.types.js'
import type { Friend } from '@root/types/plex.types.js'
import {
  sendWatchlistAdded,
  type WatchlistItemInfo,
} from '@services/notifications/orchestration/watchlist-added.js'
import { describe, expect, it, vi } from 'vitest'
import {
  ADMIN_DISCORD_ID,
  createNotificationDeps,
} from '../../../../mocks/notification-deps.js'
import { createMockUser } from '../../../../mocks/user.js'

function createDeps(watchlistAddNotify: NotifyOption) {
  const fakes = createNotificationDeps({ watchlistAddNotify })
  fakes.db.getUser.mockResolvedValue(createMockUser(1, 'alice'))
  return fakes
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
  it('sends only the webhook when set to webhook-only', async () => {
    const { deps, discordWebhook, discordBot, apprise } =
      createDeps('webhook-only')

    const result = await sendWatchlistAdded(deps, USER, ITEM)

    expect(result).toBe(true)
    expect(discordWebhook.sendNotification).toHaveBeenCalledTimes(1)
    expect(discordBot.sendNotification).not.toHaveBeenCalled()
    expect(apprise.sendNotification).not.toHaveBeenCalled()
  })

  it('sends an admin DM to the primary user when set to dm-only', async () => {
    const { deps, db, discordWebhook, discordBot, apprise } =
      createDeps('dm-only')

    const result = await sendWatchlistAdded(deps, USER, ITEM)

    expect(result).toBe(true)
    expect(db.getPrimaryUser).toHaveBeenCalledTimes(1)
    expect(discordBot.sendNotification).toHaveBeenCalledWith(ADMIN_DISCORD_ID, {
      embed: expect.objectContaining({
        title: 'Watchlist add: Night of the Living Dead',
        footer: expect.objectContaining({ text: 'Added by alice' }),
      }),
    })
    expect(discordWebhook.sendNotification).not.toHaveBeenCalled()
    expect(apprise.sendNotification).not.toHaveBeenCalled()
  })

  it('prefers the adder alias over username in the DM footer', async () => {
    const { deps, db, discordBot } = createDeps('dm-only')
    db.getUser.mockResolvedValue(
      createMockUser(1, 'alice', { alias: 'AliceAlias' }),
    )

    await sendWatchlistAdded(deps, USER, ITEM)

    expect(discordBot.sendNotification).toHaveBeenCalledWith(ADMIN_DISCORD_ID, {
      embed: expect.objectContaining({
        footer: expect.objectContaining({ text: 'Added by AliceAlias' }),
      }),
    })
  })

  it('sends only apprise when set to apprise-only', async () => {
    const { deps, discordWebhook, discordBot, apprise } =
      createDeps('apprise-only')

    await sendWatchlistAdded(deps, USER, ITEM)

    expect(apprise.sendNotification).toHaveBeenCalledTimes(1)
    expect(discordWebhook.sendNotification).not.toHaveBeenCalled()
    expect(discordBot.sendNotification).not.toHaveBeenCalled()
  })

  it('sends webhook, DM, and apprise when set to all', async () => {
    const { deps, discordWebhook, discordBot, apprise } = createDeps('all')

    await sendWatchlistAdded(deps, USER, ITEM)

    expect(discordWebhook.sendNotification).toHaveBeenCalledTimes(1)
    expect(discordBot.sendNotification).toHaveBeenCalledTimes(1)
    expect(apprise.sendNotification).toHaveBeenCalledTimes(1)
  })

  it('skips all Discord and Apprise channels when set to none', async () => {
    const { deps, discordWebhook, discordBot, apprise } = createDeps('none')

    await sendWatchlistAdded(deps, USER, ITEM)

    expect(discordWebhook.sendNotification).not.toHaveBeenCalled()
    expect(discordBot.sendNotification).not.toHaveBeenCalled()
    expect(apprise.sendNotification).not.toHaveBeenCalled()
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

  it('applies a sync toggle on the next notification', async () => {
    const { deps, db, discordWebhook } = createDeps('webhook-only')

    await expect(sendWatchlistAdded(deps, USER, ITEM)).resolves.toBe(true)

    db.getUser.mockResolvedValue(
      createMockUser(1, 'alice', { can_sync: false }),
    )
    await expect(sendWatchlistAdded(deps, USER, ITEM)).resolves.toBe(false)

    db.getUser.mockResolvedValue(createMockUser(1, 'alice'))
    await expect(sendWatchlistAdded(deps, USER, ITEM)).resolves.toBe(true)

    expect(discordWebhook.sendNotification).toHaveBeenCalledTimes(2)
  })

  it('skips an unknown user', async () => {
    const { deps, db, discordWebhook } = createDeps('webhook-only')
    db.getUser.mockResolvedValue(undefined)

    await expect(sendWatchlistAdded(deps, USER, ITEM)).resolves.toBe(false)
    expect(discordWebhook.sendNotification).not.toHaveBeenCalled()
  })
})
