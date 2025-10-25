import type { TokenWatchlistItem } from '@root/types/plex.types.js'
import type { SonarrEpisodeSchema } from '@root/types/sonarr.types.js'
import {
  createNotificationObject,
  createPublicContentNotification,
  determineNotificationType,
  extractUserDiscordIds,
  getPublicContentNotificationFlags,
} from '@utils/notifications/notification-builder.js'
import { describe, expect, it } from 'vitest'

describe('notification-builder', () => {
  describe('extractUserDiscordIds', () => {
    it('should extract unique Discord IDs from notifications', () => {
      const notifications = [
        {
          user: { id: 1, discord_id: 'user1' },
        },
        {
          user: { id: 2, discord_id: 'user2' },
        },
        {
          user: { id: 3, discord_id: 'user1' }, // duplicate
        },
      ]

      const result = extractUserDiscordIds(notifications)

      expect(result).toEqual(['user1', 'user2'])
      expect(result).toHaveLength(2)
    })

    it('should exclude virtual user with ID -1', () => {
      const notifications = [
        {
          user: { id: -1, discord_id: 'virtual' },
        },
        {
          user: { id: 1, discord_id: 'user1' },
        },
      ]

      const result = extractUserDiscordIds(notifications)

      expect(result).toEqual(['user1'])
      expect(result).not.toContain('virtual')
    })

    it('should exclude users with null discord_id', () => {
      const notifications = [
        {
          user: { id: 1, discord_id: null },
        },
        {
          user: { id: 2, discord_id: 'user2' },
        },
      ]

      const result = extractUserDiscordIds(notifications)

      expect(result).toEqual(['user2'])
    })

    it('should exclude users with empty discord_id', () => {
      const notifications = [
        {
          user: { id: 1, discord_id: '' },
        },
        {
          user: { id: 2, discord_id: '   ' },
        },
        {
          user: { id: 3, discord_id: 'user3' },
        },
      ]

      const result = extractUserDiscordIds(notifications)

      expect(result).toEqual(['user3'])
    })

    it('should return empty array when no valid Discord IDs', () => {
      const notifications = [
        {
          user: { id: 1, discord_id: null },
        },
        {
          user: { id: -1, discord_id: 'virtual' },
        },
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
        {
          user: { id: 1, discord_id: 'user1' },
        },
        {
          user: { id: 2, discord_id: 'user1' },
        },
        {
          user: { id: 3, discord_id: 'user1' },
        },
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

  describe('createNotificationObject', () => {
    const mockReferenceItem: TokenWatchlistItem = {
      id: '123',
      key: '123',
      title: 'Fallback Title',
      type: 'movie',
      thumb: 'https://example.com/thumb.jpg',
      guids: ['tmdb:12345'],
      genres: ['Action'],
      user_id: 1,
      status: 'pending',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }

    it('should create notification object with media title', () => {
      const mediaInfo = {
        type: 'movie' as const,
        guid: 'tmdb:12345',
        title: 'Test Movie',
      }

      const result = createNotificationObject(
        mediaInfo,
        mockReferenceItem,
        'testuser',
      )

      expect(result).toEqual({
        type: 'movie',
        title: 'Test Movie',
        username: 'testuser',
        posterUrl: 'https://example.com/thumb.jpg',
      })
    })

    it('should use media title even when empty string', () => {
      const mediaInfo = {
        type: 'movie' as const,
        guid: 'tmdb:12345',
        title: '',
      }

      const result = createNotificationObject(
        mediaInfo,
        mockReferenceItem,
        'testuser',
      )

      // ?? operator doesn't treat empty string as nullish, so it keeps the empty string
      expect(result.title).toBe('')
    })

    it('should omit posterUrl when thumb is null', () => {
      const itemWithoutThumb: TokenWatchlistItem = {
        ...mockReferenceItem,
        thumb: null as unknown as string,
      }

      const mediaInfo = {
        type: 'show' as const,
        guid: 'tvdb:12345',
        title: 'Test Show',
      }

      const result = createNotificationObject(
        mediaInfo,
        itemWithoutThumb,
        'testuser',
      )

      expect(result).toEqual({
        type: 'show',
        title: 'Test Show',
        username: 'testuser',
        posterUrl: undefined,
      })
    })

    it('should omit posterUrl when thumb is empty string', () => {
      const itemWithEmptyThumb: TokenWatchlistItem = {
        ...mockReferenceItem,
        thumb: '',
      }

      const mediaInfo = {
        type: 'movie' as const,
        guid: 'tmdb:12345',
        title: 'Test Movie',
      }

      const result = createNotificationObject(
        mediaInfo,
        itemWithEmptyThumb,
        'testuser',
      )

      expect(result.posterUrl).toBeUndefined()
    })

    it('should handle show type correctly', () => {
      const mediaInfo = {
        type: 'show' as const,
        guid: 'tvdb:12345',
        title: 'Test Show',
      }

      const result = createNotificationObject(
        mediaInfo,
        mockReferenceItem,
        'showfan',
      )

      expect(result).toEqual({
        type: 'show',
        title: 'Test Show',
        username: 'showfan',
        posterUrl: 'https://example.com/thumb.jpg',
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

  describe('createPublicContentNotification', () => {
    const mockNotification = {
      type: 'movie' as const,
      title: 'Test Movie',
      username: 'Public Content',
      posterUrl: 'https://example.com/poster.jpg',
    }

    it('should create public notification with virtual user ID -1', () => {
      const result = createPublicContentNotification(
        mockNotification,
        true,
        true,
      )

      expect(result.user.id).toBe(-1)
      expect(result.user.name).toBe('Public Content')
    })

    it('should enable Discord when hasDiscordUrls is true', () => {
      const result = createPublicContentNotification(
        mockNotification,
        true,
        false,
      )

      expect(result.user.notify_discord).toBe(true)
      expect(result.user.notify_apprise).toBe(false)
    })

    it('should enable Apprise when hasAppriseUrls is true', () => {
      const result = createPublicContentNotification(
        mockNotification,
        false,
        true,
      )

      expect(result.user.notify_discord).toBe(false)
      expect(result.user.notify_apprise).toBe(true)
    })

    it('should enable both when both flags are true', () => {
      const result = createPublicContentNotification(
        mockNotification,
        true,
        true,
      )

      expect(result.user.notify_discord).toBe(true)
      expect(result.user.notify_apprise).toBe(true)
    })

    it('should disable Tautulli for public notifications', () => {
      const result = createPublicContentNotification(
        mockNotification,
        true,
        true,
      )

      expect(result.user.notify_tautulli).toBe(false)
      expect(result.user.tautulli_notifier_id).toBeNull()
    })

    it('should set can_sync to false', () => {
      const result = createPublicContentNotification(
        mockNotification,
        true,
        true,
      )

      expect(result.user.can_sync).toBe(false)
    })

    it('should include the notification payload', () => {
      const result = createPublicContentNotification(
        mockNotification,
        true,
        true,
      )

      expect(result.notification).toEqual(mockNotification)
    })

    it('should set all personal fields to null', () => {
      const result = createPublicContentNotification(
        mockNotification,
        true,
        true,
      )

      expect(result.user.apprise).toBeNull()
      expect(result.user.alias).toBeNull()
      expect(result.user.discord_id).toBeNull()
    })

    it('should work with show notifications', () => {
      const showNotification = {
        type: 'show' as const,
        title: 'Test Show',
        username: 'Public Content',
        posterUrl: 'https://example.com/show.jpg',
      }

      const result = createPublicContentNotification(
        showNotification,
        true,
        false,
      )

      expect(result.notification.type).toBe('show')
      expect(result.notification.title).toBe('Test Show')
    })
  })
})
