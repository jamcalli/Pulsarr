import type { Config } from '@root/types/config.types.js'
import { getPublicContentUrls } from '@utils/notifications/url-parser.js'
import { describe, expect, it } from 'vitest'

describe('url-parser', () => {
  describe('getPublicContentUrls', () => {
    describe('Discord URLs', () => {
      it('should return movie-specific Discord URLs for movie type', () => {
        const config: Config['publicContentNotifications'] = {
          enabled: true,
          discordWebhookUrlsMovies:
            'https://discord.com/movie1,https://discord.com/movie2',
        }

        const result = getPublicContentUrls(config, 'movie', 'discord')

        expect(result).toEqual([
          'https://discord.com/movie1',
          'https://discord.com/movie2',
        ])
      })

      it('should return show-specific Discord URLs for show type', () => {
        const config: Config['publicContentNotifications'] = {
          enabled: true,
          discordWebhookUrlsShows:
            'https://discord.com/show1,https://discord.com/show2',
        }

        const result = getPublicContentUrls(config, 'show', 'discord')

        expect(result).toEqual([
          'https://discord.com/show1',
          'https://discord.com/show2',
        ])
      })

      it('should fallback to generic Discord URLs when no movie-specific URLs', () => {
        const config: Config['publicContentNotifications'] = {
          enabled: true,
          discordWebhookUrls: 'https://discord.com/generic',
        }

        const result = getPublicContentUrls(config, 'movie', 'discord')

        expect(result).toEqual(['https://discord.com/generic'])
      })

      it('should fallback to generic Discord URLs when no show-specific URLs', () => {
        const config: Config['publicContentNotifications'] = {
          enabled: true,
          discordWebhookUrls: 'https://discord.com/generic',
        }

        const result = getPublicContentUrls(config, 'show', 'discord')

        expect(result).toEqual(['https://discord.com/generic'])
      })

      it('should prioritize type-specific URLs over generic URLs', () => {
        const config: Config['publicContentNotifications'] = {
          enabled: true,
          discordWebhookUrls: 'https://discord.com/generic',
          discordWebhookUrlsMovies: 'https://discord.com/movies',
        }

        const result = getPublicContentUrls(config, 'movie', 'discord')

        expect(result).toEqual(['https://discord.com/movies'])
        expect(result).not.toContain('https://discord.com/generic')
      })

      it('should return empty array when no Discord URLs configured', () => {
        const config: Config['publicContentNotifications'] = {
          enabled: true,
        }

        const result = getPublicContentUrls(config, 'movie', 'discord')

        expect(result).toEqual([])
      })
    })

    describe('Apprise URLs', () => {
      it('should return movie-specific Apprise URLs for movie type', () => {
        const config: Config['publicContentNotifications'] = {
          enabled: true,
          appriseUrlsMovies: 'apprise://service1,apprise://service2',
        }

        const result = getPublicContentUrls(config, 'movie', 'apprise')

        expect(result).toEqual(['apprise://service1', 'apprise://service2'])
      })

      it('should return show-specific Apprise URLs for show type', () => {
        const config: Config['publicContentNotifications'] = {
          enabled: true,
          appriseUrlsShows: 'apprise://show1,apprise://show2',
        }

        const result = getPublicContentUrls(config, 'show', 'apprise')

        expect(result).toEqual(['apprise://show1', 'apprise://show2'])
      })

      it('should fallback to generic Apprise URLs when no movie-specific URLs', () => {
        const config: Config['publicContentNotifications'] = {
          enabled: true,
          appriseUrls: 'apprise://generic',
        }

        const result = getPublicContentUrls(config, 'movie', 'apprise')

        expect(result).toEqual(['apprise://generic'])
      })

      it('should fallback to generic Apprise URLs when no show-specific URLs', () => {
        const config: Config['publicContentNotifications'] = {
          enabled: true,
          appriseUrls: 'apprise://generic',
        }

        const result = getPublicContentUrls(config, 'show', 'apprise')

        expect(result).toEqual(['apprise://generic'])
      })

      it('should prioritize type-specific URLs over generic URLs', () => {
        const config: Config['publicContentNotifications'] = {
          enabled: true,
          appriseUrls: 'apprise://generic',
          appriseUrlsMovies: 'apprise://movies',
        }

        const result = getPublicContentUrls(config, 'movie', 'apprise')

        expect(result).toEqual(['apprise://movies'])
        expect(result).not.toContain('apprise://generic')
      })

      it('should return empty array when no Apprise URLs configured', () => {
        const config: Config['publicContentNotifications'] = {
          enabled: true,
        }

        const result = getPublicContentUrls(config, 'movie', 'apprise')

        expect(result).toEqual([])
      })
    })

    describe('URL parsing', () => {
      it('should trim whitespace from URLs', () => {
        const config: Config['publicContentNotifications'] = {
          enabled: true,
          discordWebhookUrls:
            '  https://discord.com/webhook1  ,  https://discord.com/webhook2  ',
        }

        const result = getPublicContentUrls(config, 'movie', 'discord')

        expect(result).toEqual([
          'https://discord.com/webhook1',
          'https://discord.com/webhook2',
        ])
      })

      it('should deduplicate URLs', () => {
        const config: Config['publicContentNotifications'] = {
          enabled: true,
          discordWebhookUrls:
            'https://discord.com/webhook,https://discord.com/webhook,https://discord.com/webhook',
        }

        const result = getPublicContentUrls(config, 'movie', 'discord')

        expect(result).toEqual(['https://discord.com/webhook'])
        expect(result).toHaveLength(1)
      })

      it('should filter out invalid URLs', () => {
        const config: Config['publicContentNotifications'] = {
          enabled: true,
          discordWebhookUrls:
            'https://discord.com/valid,not-a-url,ftp://another,https://discord.com/valid2',
        }

        const result = getPublicContentUrls(config, 'movie', 'discord')

        expect(result).toEqual([
          'https://discord.com/valid',
          'ftp://another',
          'https://discord.com/valid2',
        ])
      })

      it('should filter out empty URLs', () => {
        const config: Config['publicContentNotifications'] = {
          enabled: true,
          discordWebhookUrls:
            'https://discord.com/webhook1,,https://discord.com/webhook2',
        }

        const result = getPublicContentUrls(config, 'movie', 'discord')

        expect(result).toEqual([
          'https://discord.com/webhook1',
          'https://discord.com/webhook2',
        ])
      })

      it('should handle single URL without comma', () => {
        const config: Config['publicContentNotifications'] = {
          enabled: true,
          discordWebhookUrls: 'https://discord.com/webhook',
        }

        const result = getPublicContentUrls(config, 'movie', 'discord')

        expect(result).toEqual(['https://discord.com/webhook'])
      })

      it('should return empty array for null config value', () => {
        const config: Config['publicContentNotifications'] = {
          enabled: true,
          discordWebhookUrls: null as unknown as string,
        }

        const result = getPublicContentUrls(config, 'movie', 'discord')

        expect(result).toEqual([])
      })

      it('should return empty array for undefined config value', () => {
        const config: Config['publicContentNotifications'] = {
          enabled: true,
          discordWebhookUrls: undefined,
        }

        const result = getPublicContentUrls(config, 'movie', 'discord')

        expect(result).toEqual([])
      })

      it('should return empty array for empty string', () => {
        const config: Config['publicContentNotifications'] = {
          enabled: true,
          discordWebhookUrls: '',
        }

        const result = getPublicContentUrls(config, 'movie', 'discord')

        expect(result).toEqual([])
      })
    })

    describe('undefined config', () => {
      it('should handle undefined config for Discord', () => {
        const result = getPublicContentUrls(undefined, 'movie', 'discord')

        expect(result).toEqual([])
      })

      it('should handle undefined config for Apprise', () => {
        const result = getPublicContentUrls(undefined, 'show', 'apprise')

        expect(result).toEqual([])
      })
    })

    describe('mixed scenarios', () => {
      it('should handle complex comma-separated list with various valid protocols', () => {
        const config: Config['publicContentNotifications'] = {
          enabled: true,
          appriseUrls:
            'apprise://service,mailto://email@test.com,discord://webhook,slack://channel',
        }

        const result = getPublicContentUrls(config, 'movie', 'apprise')

        expect(result).toEqual([
          'apprise://service',
          'mailto://email@test.com',
          'discord://webhook',
          'slack://channel',
        ])
      })

      it('should preserve order after deduplication', () => {
        const config: Config['publicContentNotifications'] = {
          enabled: true,
          discordWebhookUrls:
            'https://discord.com/first,https://discord.com/second,https://discord.com/first',
        }

        const result = getPublicContentUrls(config, 'movie', 'discord')

        // Set maintains insertion order (first occurrence)
        expect(result).toEqual([
          'https://discord.com/first',
          'https://discord.com/second',
        ])
      })
    })
  })
})
