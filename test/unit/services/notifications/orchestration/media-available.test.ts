import type {
  NotificationResult,
  SonarrEpisodeSchema,
} from '@root/types/sonarr.types.js'
import {
  determineNotificationType,
  extractUserDiscordIds,
  getPublicContentNotificationFlags,
} from '@services/notifications/orchestration/media-available.js'
import { describe, expect, it } from 'vitest'

function createTestNotification(
  userId: number,
  discordId: string | null,
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
      notify_tautulli: false,
      tautulli_notifier_id: null,
      can_sync: true,
    },
    notification: {
      type: 'movie',
      title: 'Test',
      username: `user${userId}`,
    },
  }
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
