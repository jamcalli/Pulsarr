import type { Config, User } from '@root/types/config.types.js'
import type { TokenWatchlistItem } from '@root/types/plex.types.js'
import { extractUserDiscordIds } from '@services/notifications/orchestration/media-available-enrichment.js'
import { claimUserNotifications } from '@services/notifications/orchestration/media-available-records.js'
import type { NotificationDeps } from '@services/notifications/types.js'
import { describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

function createTestUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    name: 'user1',
    apprise: null,
    alias: null,
    discord_id: '123456789012345678',
    notify_apprise: false,
    notify_discord: false,
    notify_discord_mention: false,
    notify_plex_mobile: false,
    can_sync: true,
    requires_approval: false,
    is_primary_token: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function createTestItem(userId: number): TokenWatchlistItem {
  return {
    id: '10',
    title: 'Test Movie',
    key: 'plex-key-1',
    type: 'movie',
    user_id: userId,
    status: 'grabbed',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

function createDeps(
  users: User[],
  publicContentNotifications: Config['publicContentNotifications'],
) {
  const db = {
    getUsersByIds: vi.fn().mockResolvedValue(users),
    hasActiveNotification: vi.fn().mockResolvedValue(false),
    updateWatchlistItem: vi.fn().mockResolvedValue(undefined),
    createNotificationRecord: vi.fn().mockResolvedValue(1),
    transaction: vi.fn(
      async (cb: (trx: unknown) => Promise<void>) => await cb({}),
    ),
  }
  const deps = {
    db,
    config: { publicContentNotifications },
    logger: createMockLogger(),
  } as unknown as NotificationDeps
  return { deps, db }
}

describe('media-available records', () => {
  describe('claimUserNotifications', () => {
    const mediaInfo = {
      type: 'movie' as const,
      guid: 'tmdb:12345',
      title: 'Test Movie',
    }
    const options = { isBulkRelease: false }
    const enrichment = {
      content: {
        title: 'Test Movie',
        type: 'movie' as const,
        key: 'test-key',
        guids: [],
      },
      posterUrl: undefined,
      guids: [],
      tmdbUrl: undefined,
      episodeDetails: undefined,
    }
    const typeInfo = { contentType: 'movie' as const }
    const publicDiscordConfig = {
      enabled: true,
      discordWebhookUrls: 'https://discord.com/api/webhooks/1',
    }

    it('should include a mention-only user when a public Discord webhook is configured', async () => {
      const user = createTestUser({ notify_discord_mention: true })
      const { deps, db } = createDeps([user], publicDiscordConfig)

      const results = await claimUserNotifications(
        deps,
        mediaInfo,
        options,
        [createTestItem(user.id)],
        new Map([[user.id, user]]),
        enrichment,
        typeInfo,
      )

      expect(results).toHaveLength(1)
      expect(db.createNotificationRecord).toHaveBeenCalledTimes(1)
      expect(extractUserDiscordIds(results)).toEqual(['123456789012345678'])
    })

    it('should skip a mention-only user when public content notifications are disabled', async () => {
      const user = createTestUser({ notify_discord_mention: true })
      const { deps, db } = createDeps([user], {
        ...publicDiscordConfig,
        enabled: false,
      })

      const results = await claimUserNotifications(
        deps,
        mediaInfo,
        options,
        [createTestItem(user.id)],
        new Map([[user.id, user]]),
        enrichment,
        typeInfo,
      )

      expect(results).toEqual([])
      expect(db.createNotificationRecord).not.toHaveBeenCalled()
    })

    it('should skip a mention-only user when no public Discord webhook is configured', async () => {
      const user = createTestUser({ notify_discord_mention: true })
      const { deps, db } = createDeps([user], { enabled: true })

      const results = await claimUserNotifications(
        deps,
        mediaInfo,
        options,
        [createTestItem(user.id)],
        new Map([[user.id, user]]),
        enrichment,
        typeInfo,
      )

      expect(results).toEqual([])
      expect(db.createNotificationRecord).not.toHaveBeenCalled()
    })

    it('should skip a mention-only user whose discord_id is not a snowflake', async () => {
      const user = createTestUser({
        notify_discord_mention: true,
        discord_id: 'alice#1234',
      })
      const { deps, db } = createDeps([user], publicDiscordConfig)

      const results = await claimUserNotifications(
        deps,
        mediaInfo,
        options,
        [createTestItem(user.id)],
        new Map([[user.id, user]]),
        enrichment,
        typeInfo,
      )

      expect(results).toEqual([])
      expect(db.createNotificationRecord).not.toHaveBeenCalled()
    })

    it('should skip a mention-only user without a discord_id', async () => {
      const user = createTestUser({
        notify_discord_mention: true,
        discord_id: null,
      })
      const { deps, db } = createDeps([user], publicDiscordConfig)

      const results = await claimUserNotifications(
        deps,
        mediaInfo,
        options,
        [createTestItem(user.id)],
        new Map([[user.id, user]]),
        enrichment,
        typeInfo,
      )

      expect(results).toEqual([])
      expect(db.createNotificationRecord).not.toHaveBeenCalled()
    })

    it('should skip a user with all channels and mentions disabled', async () => {
      const user = createTestUser()
      const { deps, db } = createDeps([user], publicDiscordConfig)

      const results = await claimUserNotifications(
        deps,
        mediaInfo,
        options,
        [createTestItem(user.id)],
        new Map([[user.id, user]]),
        enrichment,
        typeInfo,
      )

      expect(results).toEqual([])
      expect(db.createNotificationRecord).not.toHaveBeenCalled()
    })

    it('should include a user with a personal channel enabled regardless of public config', async () => {
      const user = createTestUser({ notify_discord: true })
      const { deps } = createDeps([user], undefined)

      const results = await claimUserNotifications(
        deps,
        mediaInfo,
        options,
        [createTestItem(user.id)],
        new Map([[user.id, user]]),
        enrichment,
        typeInfo,
      )

      expect(results).toHaveLength(1)
    })
  })
})
