// Mock native-webhook to avoid transitive import of webhook-payloads.schema.ts
// which triggers a known Bun + Vite SSR transform bug with Zod
// See: https://github.com/oven-sh/bun/issues/21614
vi.mock('@services/notifications/channels/native-webhook.js', () => ({
  dispatchWebhooks: vi.fn(),
  hasWebhooksForEvent: vi.fn().mockReturnValue(false),
}))

import type { Config, User } from '@root/types/config.types.js'
import type { TokenWatchlistItem } from '@root/types/plex.types.js'
import type {
  NotificationResult,
  SonarrEpisodeSchema,
} from '@root/types/sonarr.types.js'
import type { MediaAvailableDeps } from '@services/notifications/orchestration/media-available.js'
import {
  buildUserNotifications,
  determineNotificationType,
  extractUserDiscordIds,
  getPublicContentNotificationFlags,
} from '@services/notifications/orchestration/media-available.js'
import { describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

function createTestNotification(
  userId: number,
  discordId: string | null,
  notifyDiscordMention = true,
): NotificationResult {
  return {
    user: {
      id: userId,
      name: `user${userId}`,
      apprise: null,
      alias: null,
      discord_id: discordId,
      notify_apprise: false,
      notify_discord: true,
      notify_discord_mention: notifyDiscordMention,
      notify_plex_mobile: false,
      can_sync: true,
    },
    notification: {
      type: 'movie',
      title: 'Test',
      username: `user${userId}`,
    },
  }
}

function createTestUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    name: 'user1',
    apprise: null,
    alias: null,
    discord_id: '123456789',
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
  } as unknown as MediaAvailableDeps
  return { deps, db }
}

describe('media-available helpers', () => {
  describe('extractUserDiscordIds', () => {
    it('should extract unique Discord IDs from notifications', () => {
      const notifications = [
        createTestNotification(1, 'user1'),
        createTestNotification(2, 'user2'),
        createTestNotification(3, 'user1'), // duplicate
      ]

      const result = extractUserDiscordIds(notifications)

      expect(result).toEqual(['user1', 'user2'])
      expect(result).toHaveLength(2)
    })

    it('should exclude virtual user with ID -1', () => {
      const notifications = [
        createTestNotification(-1, 'virtual'),
        createTestNotification(1, 'user1'),
      ]

      const result = extractUserDiscordIds(notifications)

      expect(result).toEqual(['user1'])
      expect(result).not.toContain('virtual')
    })

    it('should exclude users with null discord_id', () => {
      const notifications = [
        createTestNotification(1, null),
        createTestNotification(2, 'user2'),
      ]

      const result = extractUserDiscordIds(notifications)

      expect(result).toEqual(['user2'])
    })

    it('should exclude users with empty discord_id', () => {
      const notifications = [
        createTestNotification(1, ''),
        createTestNotification(2, '   '),
        createTestNotification(3, 'user3'),
      ]

      const result = extractUserDiscordIds(notifications)

      expect(result).toEqual(['user3'])
    })

    it('should return empty array when no valid Discord IDs', () => {
      const notifications = [
        createTestNotification(1, null),
        createTestNotification(-1, 'virtual'),
      ]

      const result = extractUserDiscordIds(notifications)

      expect(result).toEqual([])
    })

    it('should return empty array for empty input', () => {
      const result = extractUserDiscordIds([])

      expect(result).toEqual([])
    })

    it('should handle multiple duplicates correctly', () => {
      const notifications = [
        createTestNotification(1, 'user1'),
        createTestNotification(2, 'user1'),
        createTestNotification(3, 'user1'),
      ]

      const result = extractUserDiscordIds(notifications)

      expect(result).toEqual(['user1'])
      expect(result).toHaveLength(1)
    })

    it('should exclude users with notify_discord_mention=false', () => {
      const notifications = [
        createTestNotification(1, 'user1', true),
        createTestNotification(2, 'user2', false),
        createTestNotification(3, 'user3', true),
      ]

      const result = extractUserDiscordIds(notifications)

      expect(result).toEqual(['user1', 'user3'])
      expect(result).not.toContain('user2')
    })

    it('should return empty array when all users have notify_discord_mention=false', () => {
      const notifications = [
        createTestNotification(1, 'user1', false),
        createTestNotification(2, 'user2', false),
      ]

      const result = extractUserDiscordIds(notifications)

      expect(result).toEqual([])
    })

    it('should include users with notify_discord_mention=true', () => {
      const notifications = [
        createTestNotification(1, 'user1', true),
        createTestNotification(2, 'user2', true),
      ]

      const result = extractUserDiscordIds(notifications)

      expect(result).toEqual(['user1', 'user2'])
    })
  })

  describe('buildUserNotifications', () => {
    const mediaInfo = {
      type: 'movie' as const,
      guid: 'tmdb:12345',
      title: 'Test Movie',
    }
    const options = { isBulkRelease: false }
    const enrichment = {
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

      const results = await buildUserNotifications(
        deps,
        mediaInfo,
        options,
        [createTestItem(user.id)],
        enrichment,
        typeInfo,
        false,
      )

      expect(results).toHaveLength(1)
      expect(db.createNotificationRecord).toHaveBeenCalledTimes(1)
      expect(extractUserDiscordIds(results)).toEqual(['123456789'])
    })

    it('should skip a mention-only user when public content notifications are disabled', async () => {
      const user = createTestUser({ notify_discord_mention: true })
      const { deps, db } = createDeps([user], {
        ...publicDiscordConfig,
        enabled: false,
      })

      const results = await buildUserNotifications(
        deps,
        mediaInfo,
        options,
        [createTestItem(user.id)],
        enrichment,
        typeInfo,
        false,
      )

      expect(results).toEqual([])
      expect(db.createNotificationRecord).not.toHaveBeenCalled()
    })

    it('should skip a mention-only user when no public Discord webhook is configured', async () => {
      const user = createTestUser({ notify_discord_mention: true })
      const { deps, db } = createDeps([user], { enabled: true })

      const results = await buildUserNotifications(
        deps,
        mediaInfo,
        options,
        [createTestItem(user.id)],
        enrichment,
        typeInfo,
        false,
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

      const results = await buildUserNotifications(
        deps,
        mediaInfo,
        options,
        [createTestItem(user.id)],
        enrichment,
        typeInfo,
        false,
      )

      expect(results).toEqual([])
      expect(db.createNotificationRecord).not.toHaveBeenCalled()
    })

    it('should skip a user with all channels and mentions disabled', async () => {
      const user = createTestUser()
      const { deps, db } = createDeps([user], publicDiscordConfig)

      const results = await buildUserNotifications(
        deps,
        mediaInfo,
        options,
        [createTestItem(user.id)],
        enrichment,
        typeInfo,
        false,
      )

      expect(results).toEqual([])
      expect(db.createNotificationRecord).not.toHaveBeenCalled()
    })

    it('should include a user with a personal channel enabled regardless of public config', async () => {
      const user = createTestUser({ notify_discord: true })
      const { deps } = createDeps([user], undefined)

      const results = await buildUserNotifications(
        deps,
        mediaInfo,
        options,
        [createTestItem(user.id)],
        enrichment,
        typeInfo,
        false,
      )

      expect(results).toHaveLength(1)
    })
  })

  describe('determineNotificationType', () => {
    const mockEpisode: SonarrEpisodeSchema = {
      seasonNumber: 1,
      episodeNumber: 1,
      title: 'Pilot',
      airDateUtc: '2024-01-01T00:00:00Z',
    }

    it('should return movie type for movie media', () => {
      const mediaInfo = {
        type: 'movie' as const,
        guid: 'tmdb:12345',
        title: 'Test Movie',
      }

      const result = determineNotificationType(mediaInfo, false)

      expect(result).toEqual({
        contentType: 'movie',
        seasonNumber: undefined,
        episodeNumber: undefined,
      })
    })

    it('should return season type for bulk show release', () => {
      const mediaInfo = {
        type: 'show' as const,
        guid: 'tvdb:12345',
        title: 'Test Show',
        episodes: [mockEpisode],
      }

      const result = determineNotificationType(mediaInfo, true)

      expect(result).toEqual({
        contentType: 'season',
        seasonNumber: 1,
        episodeNumber: undefined,
      })
    })

    it('should return episode type for single episode release', () => {
      const mediaInfo = {
        type: 'show' as const,
        guid: 'tvdb:12345',
        title: 'Test Show',
        episodes: [mockEpisode],
      }

      const result = determineNotificationType(mediaInfo, false)

      expect(result).toEqual({
        contentType: 'episode',
        seasonNumber: 1,
        episodeNumber: 1,
      })
    })

    it('should return null for show without episodes', () => {
      const mediaInfo = {
        type: 'show' as const,
        guid: 'tvdb:12345',
        title: 'Test Show',
        episodes: [],
      }

      const result = determineNotificationType(mediaInfo, false)

      expect(result).toBeNull()
    })

    it('should return null for show without episodes property', () => {
      const mediaInfo = {
        type: 'show' as const,
        guid: 'tvdb:12345',
        title: 'Test Show',
      }

      const result = determineNotificationType(mediaInfo, false)

      expect(result).toBeNull()
    })

    it('should use first episode for season number in bulk release', () => {
      const episodes: SonarrEpisodeSchema[] = [
        {
          seasonNumber: 2,
          episodeNumber: 1,
          title: 'S2E1',
          airDateUtc: '2024-01-01T00:00:00Z',
        },
        {
          seasonNumber: 2,
          episodeNumber: 2,
          title: 'S2E2',
          airDateUtc: '2024-01-08T00:00:00Z',
        },
      ]

      const mediaInfo = {
        type: 'show' as const,
        guid: 'tvdb:12345',
        title: 'Test Show',
        episodes,
      }

      const result = determineNotificationType(mediaInfo, true)

      expect(result).toEqual({
        contentType: 'season',
        seasonNumber: 2,
        episodeNumber: undefined,
      })
    })
  })

  describe('getPublicContentNotificationFlags', () => {
    it('should return true for Discord when discordWebhookUrls is present', () => {
      const config = {
        enabled: true,
        discordWebhookUrls: 'https://discord.com/webhook1',
      }

      const result = getPublicContentNotificationFlags(config)

      expect(result).toEqual({
        hasDiscordUrls: true,
        hasAppriseUrls: false,
      })
    })

    it('should return true for Discord when movie-specific URLs present', () => {
      const config = {
        enabled: true,
        discordWebhookUrlsMovies: 'https://discord.com/webhook-movies',
      }

      const result = getPublicContentNotificationFlags(config)

      expect(result.hasDiscordUrls).toBe(true)
    })

    it('should return true for Discord when show-specific URLs present', () => {
      const config = {
        enabled: true,
        discordWebhookUrlsShows: 'https://discord.com/webhook-shows',
      }

      const result = getPublicContentNotificationFlags(config)

      expect(result.hasDiscordUrls).toBe(true)
    })

    it('should return true for Apprise when appriseUrls is present', () => {
      const config = {
        enabled: true,
        appriseUrls: 'apprise://service',
      }

      const result = getPublicContentNotificationFlags(config)

      expect(result).toEqual({
        hasDiscordUrls: false,
        hasAppriseUrls: true,
      })
    })

    it('should return true for Apprise when movie-specific URLs present', () => {
      const config = {
        enabled: true,
        appriseUrlsMovies: 'apprise://movies',
      }

      const result = getPublicContentNotificationFlags(config)

      expect(result.hasAppriseUrls).toBe(true)
    })

    it('should return true for Apprise when show-specific URLs present', () => {
      const config = {
        enabled: true,
        appriseUrlsShows: 'apprise://shows',
      }

      const result = getPublicContentNotificationFlags(config)

      expect(result.hasAppriseUrls).toBe(true)
    })

    it('should return true for both when both are configured', () => {
      const config = {
        enabled: true,
        discordWebhookUrls: 'https://discord.com/webhook',
        appriseUrls: 'apprise://service',
      }

      const result = getPublicContentNotificationFlags(config)

      expect(result).toEqual({
        hasDiscordUrls: true,
        hasAppriseUrls: true,
      })
    })

    it('should return false for both when config is undefined', () => {
      const result = getPublicContentNotificationFlags(undefined)

      expect(result).toEqual({
        hasDiscordUrls: false,
        hasAppriseUrls: false,
      })
    })

    it('should return false for both when config is empty', () => {
      const config = {
        enabled: true,
      }

      const result = getPublicContentNotificationFlags(config)

      expect(result).toEqual({
        hasDiscordUrls: false,
        hasAppriseUrls: false,
      })
    })

    it('should handle empty arrays correctly', () => {
      const config = {
        enabled: true,
        discordWebhookUrls: '',
        appriseUrls: '',
      }

      const result = getPublicContentNotificationFlags(config)

      expect(result).toEqual({
        hasDiscordUrls: false,
        hasAppriseUrls: false,
      })
    })
  })
})
