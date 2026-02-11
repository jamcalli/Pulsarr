import type { WebhookPayload } from '@schemas/notifications/webhook.schema.js'
import {
  extractContentGuidFromWebhook,
  extractTagsFromWebhook,
} from '@services/plex-label-sync/utils/webhook-parser.js'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

describe('webhook-parser', () => {
  let mockLogger: ReturnType<typeof createMockLogger>

  beforeEach(() => {
    mockLogger = createMockLogger()
  })

  describe('extractTagsFromWebhook', () => {
    it('should extract tags from Radarr webhook', () => {
      const webhook = {
        movie: {
          id: 123,
          title: 'Test Movie',
          tmdbId: 123,
          tags: ['action', 'thriller', 'hd'],
        },
      } as unknown as WebhookPayload

      const result = extractTagsFromWebhook(webhook, mockLogger)

      expect(result).toEqual(['action', 'thriller', 'hd'])
    })

    it('should extract tags from Sonarr webhook', () => {
      const webhook = {
        series: {
          id: 456,
          title: 'Test Series',
          tvdbId: 456,
          tags: ['drama', 'comedy'],
        },
      } as unknown as WebhookPayload

      const result = extractTagsFromWebhook(webhook, mockLogger)

      expect(result).toEqual(['drama', 'comedy'])
    })

    it('should return empty array for Test events', () => {
      const webhook = {
        eventType: 'Test',
      } as unknown as WebhookPayload

      const result = extractTagsFromWebhook(webhook, mockLogger)

      expect(result).toEqual([])
    })

    it('should handle Radarr webhook with empty tags array', () => {
      const webhook = {
        movie: {
          id: 123,
          title: 'Test Movie',
          tmdbId: 123,
          tags: [],
        },
      } as unknown as WebhookPayload

      const result = extractTagsFromWebhook(webhook, mockLogger)

      expect(result).toEqual([])
    })

    it('should handle Sonarr webhook with empty tags array', () => {
      const webhook = {
        series: {
          id: 456,
          title: 'Test Series',
          tvdbId: 456,
          tags: [],
        },
      } as unknown as WebhookPayload

      const result = extractTagsFromWebhook(webhook, mockLogger)

      expect(result).toEqual([])
    })

    it('should return empty array when Radarr movie has no tags property', () => {
      const webhook = {
        movie: {
          id: 123,
          title: 'Test Movie',
          tmdbId: 123,
        },
      } as unknown as WebhookPayload

      const result = extractTagsFromWebhook(webhook, mockLogger)

      expect(result).toEqual([])
    })

    it('should return empty array when Sonarr series has no tags property', () => {
      const webhook = {
        series: {
          id: 456,
          title: 'Test Series',
          tvdbId: 456,
        },
      } as unknown as WebhookPayload

      const result = extractTagsFromWebhook(webhook, mockLogger)

      expect(result).toEqual([])
    })

    it('should convert numeric tags to strings', () => {
      const webhook = {
        movie: {
          id: 123,
          title: 'Test Movie',
          tmdbId: 123,
          tags: [1, 2, 3],
        },
      } as unknown as WebhookPayload

      const result = extractTagsFromWebhook(webhook, mockLogger)

      expect(result).toEqual(['1', '2', '3'])
    })

    it('should return empty array for unknown webhook format', () => {
      const webhook = {
        unknown: {
          id: 999,
        },
      } as unknown as WebhookPayload

      const result = extractTagsFromWebhook(webhook, mockLogger)

      expect(result).toEqual([])
    })

    it('should handle error during tag extraction and log it', () => {
      const webhook = {
        get movie() {
          throw new Error('Test error')
        },
      } as unknown as WebhookPayload

      const result = extractTagsFromWebhook(webhook, mockLogger)

      expect(result).toEqual([])
    })

    it('should handle mixed string and numeric tags', () => {
      const webhook = {
        movie: {
          id: 123,
          title: 'Test Movie',
          tmdbId: 123,
          tags: ['action', 1, 'thriller', 2],
        },
      } as unknown as WebhookPayload

      const result = extractTagsFromWebhook(webhook, mockLogger)

      expect(result).toEqual(['action', '1', 'thriller', '2'])
    })
  })

  describe('extractContentGuidFromWebhook', () => {
    it('should extract GUID and content type from Radarr webhook', () => {
      const webhook = {
        movie: {
          id: 123,
          title: 'Test Movie',
          tmdbId: 12345,
        },
      } as unknown as WebhookPayload

      const result = extractContentGuidFromWebhook(webhook, mockLogger)

      expect(result).toEqual({
        guids: ['tmdb:12345'],
        contentType: 'movie',
      })
    })

    it('should extract GUID and content type from Sonarr webhook', () => {
      const webhook = {
        series: {
          id: 456,
          title: 'Test Series',
          tvdbId: 67890,
        },
      } as unknown as WebhookPayload

      const result = extractContentGuidFromWebhook(webhook, mockLogger)

      expect(result).toEqual({
        guids: ['tvdb:67890'],
        contentType: 'show',
      })
    })

    it('should return null for Test events', () => {
      const webhook = {
        eventType: 'Test',
      } as unknown as WebhookPayload

      const result = extractContentGuidFromWebhook(webhook, mockLogger)

      expect(result).toBeNull()
    })

    it('should return null for unknown webhook format', () => {
      const webhook = {
        unknown: {
          id: 999,
        },
      } as unknown as WebhookPayload

      const result = extractContentGuidFromWebhook(webhook, mockLogger)

      expect(result).toBeNull()
    })

    it('should handle error during GUID extraction and log it', () => {
      const webhook = {
        get movie() {
          throw new Error('Test error')
        },
      } as unknown as WebhookPayload

      const result = extractContentGuidFromWebhook(webhook, mockLogger)

      expect(result).toBeNull()
    })

    it('should handle numeric tmdbId correctly', () => {
      const webhook = {
        movie: {
          id: 123,
          title: 'Test Movie',
          tmdbId: 999,
        },
      } as unknown as WebhookPayload

      const result = extractContentGuidFromWebhook(webhook, mockLogger)

      expect(result).toEqual({
        guids: ['tmdb:999'],
        contentType: 'movie',
      })
    })

    it('should handle numeric tvdbId correctly', () => {
      const webhook = {
        series: {
          id: 456,
          title: 'Test Series',
          tvdbId: 888,
        },
      } as unknown as WebhookPayload

      const result = extractContentGuidFromWebhook(webhook, mockLogger)

      expect(result).toEqual({
        guids: ['tvdb:888'],
        contentType: 'show',
      })
    })

    it('should handle string tmdbId by concatenation', () => {
      const webhook = {
        movie: {
          id: 123,
          title: 'Test Movie',
          tmdbId: '12345',
        },
      } as unknown as WebhookPayload

      const result = extractContentGuidFromWebhook(webhook, mockLogger)

      expect(result).toEqual({
        guids: ['tmdb:12345'],
        contentType: 'movie',
      })
    })

    it('should handle string tvdbId by concatenation', () => {
      const webhook = {
        series: {
          id: 456,
          title: 'Test Series',
          tvdbId: '67890',
        },
      } as unknown as WebhookPayload

      const result = extractContentGuidFromWebhook(webhook, mockLogger)

      expect(result).toEqual({
        guids: ['tvdb:67890'],
        contentType: 'show',
      })
    })
  })
})
