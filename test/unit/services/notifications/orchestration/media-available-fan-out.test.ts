import type { User } from '@root/types/config.types.js'
import type { DeliveryResult } from '@root/types/notification.types.js'
import { deliverMediaAvailable } from '@services/notifications/orchestration/media-available-fan-out.js'
import type { ClaimedNotification } from '@services/notifications/orchestration/media-available-records.js'
import type { NotificationDeps } from '@services/notifications/types.js'
import { describe, expect, it, vi } from 'vitest'
import { createDeferred } from '../../../../helpers/deferred.js'
import { createMockLogger } from '../../../../mocks/logger.js'
import { createMockUser } from '../../../../mocks/user.js'

const PLEX_USER = createMockUser(1, 'plex-viewer', {
  notify_discord_mention: false,
  notify_plex_mobile: true,
})
const DM_USER = createMockUser(2, 'dm-viewer', {
  notify_discord_mention: false,
  notify_discord: true,
  discord_id: '222222222222222222',
})

const ENRICHMENT = {
  content: {
    title: 'Alien',
    type: 'movie' as const,
    key: 'alien-key',
    guids: [],
  },
  posterUrl: undefined,
  guids: [],
  tmdbUrl: undefined,
  episodeDetails: undefined,
}

function claimFor(user: User, recordId: number): ClaimedNotification {
  return {
    user,
    notification: { type: 'movie', title: 'Alien', username: user.name },
    recordId,
    watchlistItemKey: 'alien-key',
  }
}

function createDeps(plexDelivery: Promise<DeliveryResult>) {
  const detached: Array<Promise<boolean>> = []
  const db = {
    getWebhookEndpointsForEvent: vi.fn().mockResolvedValue([]),
    getUser: vi.fn(async (id: number) =>
      [PLEX_USER, DM_USER].find((user) => user.id === id),
    ),
    updateNotificationDelivery: vi.fn().mockResolvedValue(undefined),
    deleteNotificationRecord: vi.fn().mockResolvedValue(undefined),
  }
  const discordBot = {
    sendNotification: vi.fn().mockResolvedValue({ ok: true }),
  }
  const deps = {
    db,
    logger: createMockLogger(),
    config: {},
    discordBot,
    plexMobile: {
      isEnabled: () => true,
      sendNotification: vi.fn(async () => ({ queued: plexDelivery })),
    },
    detach: (work: Promise<boolean>) => {
      detached.push(work)
    },
  } as unknown as NotificationDeps
  return { deps, db, discordBot, detached }
}

describe('deliverMediaAvailable', () => {
  it('reads user preferences at send time and releases a claim with nothing to send', async () => {
    const { deps, db, discordBot } = createDeps(new Promise(() => {}))
    db.getUser.mockResolvedValue({ ...DM_USER, notify_discord: false })

    await deliverMediaAvailable(deps, {
      mediaInfo: { type: 'movie', guid: 'tmdb:348', title: 'Alien' },
      options: { isBulkRelease: false, sequential: true },
      enrichment: ENRICHMENT,
      claims: [claimFor(DM_USER, 12)],
      watchlisters: [],
    })

    expect(discordBot.sendNotification).not.toHaveBeenCalled()
    expect(db.deleteNotificationRecord).toHaveBeenCalledWith(12)
    expect(db.updateNotificationDelivery).not.toHaveBeenCalled()
  })

  it('holds a queued Plex claim until the push fails, then releases it', async () => {
    const plexDelivery = createDeferred<DeliveryResult>()
    const { deps, db, detached } = createDeps(plexDelivery.promise)

    await deliverMediaAvailable(deps, {
      mediaInfo: { type: 'movie', guid: 'tmdb:348', title: 'Alien' },
      options: { isBulkRelease: false, sequential: true },
      enrichment: ENRICHMENT,
      claims: [claimFor(PLEX_USER, 11)],
      watchlisters: [],
    })

    expect(db.deleteNotificationRecord).not.toHaveBeenCalled()

    plexDelivery.resolve({ ok: false, reason: 'gave up' })

    expect(await detached[0]).toBe(false)
    expect(db.deleteNotificationRecord).toHaveBeenCalledWith(11)
  })

  it('a queued Plex push does not hold up later watchlisters in sequential mode', async () => {
    const plexDelivery = createDeferred<DeliveryResult>()
    const { deps, db, discordBot, detached } = createDeps(plexDelivery.promise)

    await deliverMediaAvailable(deps, {
      mediaInfo: { type: 'movie', guid: 'tmdb:348', title: 'Alien' },
      options: { isBulkRelease: false, sequential: true },
      enrichment: ENRICHMENT,
      claims: [claimFor(PLEX_USER, 11), claimFor(DM_USER, 12)],
      watchlisters: [],
    })

    expect(discordBot.sendNotification).toHaveBeenCalledWith(
      DM_USER.discord_id,
      expect.anything(),
    )
    expect(db.updateNotificationDelivery).toHaveBeenCalledWith(
      11,
      expect.objectContaining({ sent_to_plex_mobile: false }),
    )
    expect(detached).toHaveLength(1)

    plexDelivery.resolve({ ok: true })

    expect(await detached[0]).toBe(true)
    expect(db.updateNotificationDelivery).toHaveBeenLastCalledWith(11, {
      sent_to_discord: false,
      sent_to_apprise: false,
      sent_to_plex_mobile: true,
      sent_to_native_webhook: false,
    })
    expect(db.deleteNotificationRecord).not.toHaveBeenCalled()
  })
})
