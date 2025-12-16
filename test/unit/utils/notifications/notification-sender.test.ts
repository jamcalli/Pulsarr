import type { TokenWatchlistItem } from '@root/types/plex.types.js'
import type {
  MediaNotification,
  NotificationResult,
} from '@root/types/sonarr.types.js'
import { processIndividualNotification } from '@root/utils/notifications/notification-sender.js'
import type { FastifyInstance } from 'fastify'
import { describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../mocks/logger.js'

describe('notification-sender', () => {
  describe('processIndividualNotification', () => {
    const mockMediaInfo = {
      type: 'movie' as const,
      guid: 'imdb:tt1234567',
      title: 'Test Movie',
    }

    const mockNotification: MediaNotification = {
      type: 'movie',
      title: 'Test Movie',
      username: 'testuser',
      posterUrl: 'https://example.com/poster.jpg',
    }

    const mockWatchlistItem: TokenWatchlistItem = {
      id: '123',
      user_id: 1,
      title: 'Test Movie',
      key: 'plex-key-123',
      type: 'movie',
      thumb: 'https://example.com/thumb.jpg',
      added: '2024-01-01T00:00:00Z',
      guids: ['imdb:tt1234567'],
      genres: ['Action'],
      status: 'pending',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }

    describe('Discord notifications', () => {
      it('should send Discord DM when user has notify_discord enabled and discord_id', async () => {
        const sendDirectMessageSpy = vi.fn().mockResolvedValue(undefined)

        const mockFastify = {
          log: createMockLogger(),
          notifications: {
            discordBot: {
              sendDirectMessage: sendDirectMessageSpy,
            },
          },
        } as unknown as FastifyInstance

        const result: NotificationResult = {
          user: {
            id: 1,
            name: 'testuser',
            apprise: null,
            alias: 'Test User',
            discord_id: '123456789',
            notify_discord: true,
            notify_apprise: false,
            notify_tautulli: false,
            tautulli_notifier_id: null,
            can_sync: true,
          },
          notification: mockNotification,
        }

        const itemByUserId = new Map([[1, mockWatchlistItem]])

        await processIndividualNotification(
          mockFastify,
          result,
          [result],
          itemByUserId,
          mockMediaInfo,
        )

        expect(sendDirectMessageSpy).toHaveBeenCalledWith(
          '123456789',
          mockNotification,
        )
      })

      it('should NOT send Discord DM when user has notify_discord disabled', async () => {
        const sendDirectMessageSpy = vi.fn().mockResolvedValue(undefined)

        const mockFastify = {
          log: createMockLogger(),
          notifications: {
            discordBot: {
              sendDirectMessage: sendDirectMessageSpy,
            },
          },
        } as unknown as FastifyInstance

        const result: NotificationResult = {
          user: {
            id: 1,
            name: 'testuser',
            apprise: null,
            alias: 'Test User',
            discord_id: '123456789',
            notify_discord: false, // Disabled
            notify_apprise: false,
            notify_tautulli: false,
            tautulli_notifier_id: null,
            can_sync: true,
          },
          notification: mockNotification,
        }

        const itemByUserId = new Map([[1, mockWatchlistItem]])

        await processIndividualNotification(
          mockFastify,
          result,
          [result],
          itemByUserId,
          mockMediaInfo,
        )

        expect(sendDirectMessageSpy).not.toHaveBeenCalled()
      })

      it('should NOT send Discord DM when user has no discord_id', async () => {
        const sendDirectMessageSpy = vi.fn().mockResolvedValue(undefined)

        const mockFastify = {
          log: createMockLogger(),
          notifications: {
            discordBot: {
              sendDirectMessage: sendDirectMessageSpy,
            },
          },
        } as unknown as FastifyInstance

        const result: NotificationResult = {
          user: {
            id: 1,
            name: 'testuser',
            apprise: null,
            alias: 'Test User',
            discord_id: null, // No Discord ID
            notify_discord: true,
            notify_apprise: false,
            notify_tautulli: false,
            tautulli_notifier_id: null,
            can_sync: true,
          },
          notification: mockNotification,
        }

        const itemByUserId = new Map([[1, mockWatchlistItem]])

        await processIndividualNotification(
          mockFastify,
          result,
          [result],
          itemByUserId,
          mockMediaInfo,
        )

        expect(sendDirectMessageSpy).not.toHaveBeenCalled()
      })

      it('should log error when Discord DM fails but not throw', async () => {
        const sendDirectMessageSpy = vi
          .fn()
          .mockRejectedValue(new Error('Discord API error'))
        const errorLogSpy = vi.fn()

        const mockLogger = createMockLogger()
        mockLogger.error = errorLogSpy

        const mockFastify = {
          log: mockLogger,
          notifications: {
            discordBot: {
              sendDirectMessage: sendDirectMessageSpy,
            },
          },
        } as unknown as FastifyInstance

        const result: NotificationResult = {
          user: {
            id: 1,
            name: 'testuser',
            apprise: null,
            alias: 'Test User',
            discord_id: '123456789',
            notify_discord: true,
            notify_apprise: false,
            notify_tautulli: false,
            tautulli_notifier_id: null,
            can_sync: true,
          },
          notification: mockNotification,
        }

        const itemByUserId = new Map([[1, mockWatchlistItem]])

        // Should not throw despite Discord error
        await expect(
          processIndividualNotification(
            mockFastify,
            result,
            [result],
            itemByUserId,
            mockMediaInfo,
          ),
        ).resolves.toBeUndefined()

        // Should log the error
        expect(errorLogSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.any(Error),
            userId: 1,
            discord_id: '123456789',
          }),
          'Failed to send Discord notification',
        )
      })
    })

    describe('Apprise notifications', () => {
      it('should send Apprise notification when user has notify_apprise enabled', async () => {
        const sendMediaNotificationSpy = vi.fn().mockResolvedValue(undefined)

        const mockFastify = {
          log: createMockLogger(),
          notifications: {
            apprise: {
              isEnabled: vi.fn().mockReturnValue(true),
              sendMediaNotification: sendMediaNotificationSpy,
            },
          },
        } as unknown as FastifyInstance

        const result: NotificationResult = {
          user: {
            id: 1,
            name: 'testuser',
            apprise: 'apprise://service',
            alias: 'Test User',
            discord_id: null,
            notify_discord: false,
            notify_apprise: true,
            notify_tautulli: false,
            tautulli_notifier_id: null,
            can_sync: true,
          },
          notification: mockNotification,
        }

        const itemByUserId = new Map([[1, mockWatchlistItem]])

        await processIndividualNotification(
          mockFastify,
          result,
          [result],
          itemByUserId,
          mockMediaInfo,
        )

        expect(sendMediaNotificationSpy).toHaveBeenCalledWith(
          result.user,
          mockNotification,
        )
      })

      it('should NOT send Apprise notification when user has notify_apprise disabled', async () => {
        const sendMediaNotificationSpy = vi.fn().mockResolvedValue(undefined)

        const mockFastify = {
          log: createMockLogger(),
          notifications: {
            apprise: {
              isEnabled: vi.fn().mockReturnValue(true),
              sendMediaNotification: sendMediaNotificationSpy,
            },
          },
        } as unknown as FastifyInstance

        const result: NotificationResult = {
          user: {
            id: 1,
            name: 'testuser',
            apprise: 'apprise://service',
            alias: 'Test User',
            discord_id: null,
            notify_discord: false,
            notify_apprise: false, // Disabled
            notify_tautulli: false,
            tautulli_notifier_id: null,
            can_sync: true,
          },
          notification: mockNotification,
        }

        const itemByUserId = new Map([[1, mockWatchlistItem]])

        await processIndividualNotification(
          mockFastify,
          result,
          [result],
          itemByUserId,
          mockMediaInfo,
        )

        expect(sendMediaNotificationSpy).not.toHaveBeenCalled()
      })

      it('should NOT send Apprise notification when Apprise is not enabled', async () => {
        const sendMediaNotificationSpy = vi.fn().mockResolvedValue(undefined)

        const mockFastify = {
          log: {
            error: vi.fn(),
            debug: vi.fn(),
          },
          notifications: {
            apprise: {
              isEnabled: vi.fn().mockReturnValue(false), // Not enabled
              sendMediaNotification: sendMediaNotificationSpy,
            },
          },
        } as unknown as FastifyInstance

        const result: NotificationResult = {
          user: {
            id: 1,
            name: 'testuser',
            apprise: 'apprise://service',
            alias: 'Test User',
            discord_id: null,
            notify_discord: false,
            notify_apprise: true,
            notify_tautulli: false,
            tautulli_notifier_id: null,
            can_sync: true,
          },
          notification: mockNotification,
        }

        const itemByUserId = new Map([[1, mockWatchlistItem]])

        await processIndividualNotification(
          mockFastify,
          result,
          [result],
          itemByUserId,
          mockMediaInfo,
        )

        expect(sendMediaNotificationSpy).not.toHaveBeenCalled()
      })

      it('should log error when Apprise fails but not throw', async () => {
        const sendMediaNotificationSpy = vi
          .fn()
          .mockRejectedValue(new Error('Apprise error'))
        const errorLogSpy = vi.fn()

        const mockLogger = createMockLogger()
        mockLogger.error = errorLogSpy

        const mockFastify = {
          log: mockLogger,
          notifications: {
            apprise: {
              isEnabled: vi.fn().mockReturnValue(true),
              sendMediaNotification: sendMediaNotificationSpy,
            },
          },
        } as unknown as FastifyInstance

        const result: NotificationResult = {
          user: {
            id: 1,
            name: 'testuser',
            apprise: 'apprise://service',
            alias: 'Test User',
            discord_id: null,
            notify_discord: false,
            notify_apprise: true,
            notify_tautulli: false,
            tautulli_notifier_id: null,
            can_sync: true,
          },
          notification: mockNotification,
        }

        const itemByUserId = new Map([[1, mockWatchlistItem]])

        await expect(
          processIndividualNotification(
            mockFastify,
            result,
            [result],
            itemByUserId,
            mockMediaInfo,
          ),
        ).resolves.toBeUndefined()

        expect(errorLogSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.any(Error),
            userId: 1,
          }),
          'Failed to send Apprise notification',
        )
      })
    })

    describe('Tautulli notifications', () => {
      it('should send Tautulli notification when user has notify_tautulli enabled', async () => {
        const sendMediaNotificationSpy = vi.fn().mockResolvedValue(true)

        const mockFastify = {
          log: createMockLogger(),
          notifications: {
            tautulli: {
              isEnabled: vi.fn().mockReturnValue(true),
              sendMediaNotification: sendMediaNotificationSpy,
            },
          },
        } as unknown as FastifyInstance

        const result: NotificationResult = {
          user: {
            id: 1,
            name: 'testuser',
            apprise: null,
            alias: 'Test User',
            discord_id: null,
            notify_discord: false,
            notify_apprise: false,
            notify_tautulli: true,
            tautulli_notifier_id: 5,
            can_sync: true,
          },
          notification: mockNotification,
        }

        const itemByUserId = new Map([[1, mockWatchlistItem]])

        await processIndividualNotification(
          mockFastify,
          result,
          [result],
          itemByUserId,
          mockMediaInfo,
        )

        expect(sendMediaNotificationSpy).toHaveBeenCalledWith(
          result.user,
          mockNotification,
          123, // item id
          'imdb:tt1234567', // guid
          'plex-key-123', // plex key
        )
      })

      it('should NOT send Tautulli notification when user has notify_tautulli disabled', async () => {
        const sendMediaNotificationSpy = vi.fn().mockResolvedValue(true)

        const mockFastify = {
          log: createMockLogger(),
          notifications: {
            tautulli: {
              isEnabled: vi.fn().mockReturnValue(true),
              sendMediaNotification: sendMediaNotificationSpy,
            },
          },
        } as unknown as FastifyInstance

        const result: NotificationResult = {
          user: {
            id: 1,
            name: 'testuser',
            apprise: null,
            alias: 'Test User',
            discord_id: null,
            notify_discord: false,
            notify_apprise: false,
            notify_tautulli: false, // Disabled
            tautulli_notifier_id: 5,
            can_sync: true,
          },
          notification: mockNotification,
        }

        const itemByUserId = new Map([[1, mockWatchlistItem]])

        await processIndividualNotification(
          mockFastify,
          result,
          [result],
          itemByUserId,
          mockMediaInfo,
        )

        expect(sendMediaNotificationSpy).not.toHaveBeenCalled()
      })

      it('should NOT send Tautulli notification when Tautulli is not enabled', async () => {
        const sendMediaNotificationSpy = vi.fn().mockResolvedValue(true)

        const mockFastify = {
          log: {
            error: vi.fn(),
            debug: vi.fn(),
          },
          notifications: {
            tautulli: {
              isEnabled: vi.fn().mockReturnValue(false), // Not enabled
              sendMediaNotification: sendMediaNotificationSpy,
            },
          },
        } as unknown as FastifyInstance

        const result: NotificationResult = {
          user: {
            id: 1,
            name: 'testuser',
            apprise: null,
            alias: 'Test User',
            discord_id: null,
            notify_discord: false,
            notify_apprise: false,
            notify_tautulli: true,
            tautulli_notifier_id: 5,
            can_sync: true,
          },
          notification: mockNotification,
        }

        const itemByUserId = new Map([[1, mockWatchlistItem]])

        await processIndividualNotification(
          mockFastify,
          result,
          [result],
          itemByUserId,
          mockMediaInfo,
        )

        expect(sendMediaNotificationSpy).not.toHaveBeenCalled()
      })

      it('should skip Tautulli when watchlist item id is invalid', async () => {
        const sendMediaNotificationSpy = vi.fn().mockResolvedValue(true)
        const warnLogSpy = vi.fn()

        const mockLogger = createMockLogger()
        mockLogger.warn = warnLogSpy

        const mockFastify = {
          log: mockLogger,
          notifications: {
            tautulli: {
              isEnabled: vi.fn().mockReturnValue(true),
              sendMediaNotification: sendMediaNotificationSpy,
            },
          },
        } as unknown as FastifyInstance

        const result: NotificationResult = {
          user: {
            id: 1,
            name: 'testuser',
            apprise: null,
            alias: 'Test User',
            discord_id: null,
            notify_discord: false,
            notify_apprise: false,
            notify_tautulli: true,
            tautulli_notifier_id: 5,
            can_sync: true,
          },
          notification: mockNotification,
        }

        const invalidItem: TokenWatchlistItem = {
          ...mockWatchlistItem,
          id: 'invalid',
        }
        const itemByUserId = new Map<number, TokenWatchlistItem>([
          [1, invalidItem],
        ])

        await processIndividualNotification(
          mockFastify,
          result,
          [result],
          itemByUserId,
          mockMediaInfo,
        )

        expect(sendMediaNotificationSpy).not.toHaveBeenCalled()
        expect(warnLogSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            rawId: Number.NaN,
            userId: 1,
          }),
          'Skipping Tautulli – invalid item id',
        )
      })

      it('should log error when Tautulli fails but not throw', async () => {
        const sendMediaNotificationSpy = vi
          .fn()
          .mockRejectedValue(new Error('Tautulli error'))
        const errorLogSpy = vi.fn()

        const mockLogger = createMockLogger()
        mockLogger.error = errorLogSpy

        const mockFastify = {
          log: mockLogger,
          notifications: {
            tautulli: {
              isEnabled: vi.fn().mockReturnValue(true),
              sendMediaNotification: sendMediaNotificationSpy,
            },
          },
        } as unknown as FastifyInstance

        const result: NotificationResult = {
          user: {
            id: 1,
            name: 'testuser',
            apprise: null,
            alias: 'Test User',
            discord_id: null,
            notify_discord: false,
            notify_apprise: false,
            notify_tautulli: true,
            tautulli_notifier_id: 5,
            can_sync: true,
          },
          notification: mockNotification,
        }

        const itemByUserId = new Map([[1, mockWatchlistItem]])

        await expect(
          processIndividualNotification(
            mockFastify,
            result,
            [result],
            itemByUserId,
            mockMediaInfo,
          ),
        ).resolves.toBeUndefined()

        expect(errorLogSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.any(Error),
            userId: 1,
            guid: 'imdb:tt1234567',
          }),
          'Failed to send Tautulli notification',
        )
      })
    })

    describe('Public content notifications', () => {
      it('should send public Discord notification when user id is -1', async () => {
        const sendPublicNotificationSpy = vi.fn().mockResolvedValue(undefined)

        const mockFastify = {
          log: createMockLogger(),
          notifications: {
            discordWebhook: {
              sendPublicNotification: sendPublicNotificationSpy,
            },
          },
        } as unknown as FastifyInstance

        const publicResult: NotificationResult = {
          user: {
            id: -1, // Public notification marker
            name: 'Public Content',
            apprise: null,
            alias: 'Public Content',
            discord_id: null,
            notify_discord: true,
            notify_apprise: false,
            notify_tautulli: false,
            tautulli_notifier_id: null,
            can_sync: false,
          },
          notification: mockNotification,
        }

        const realUserResult: NotificationResult = {
          user: {
            id: 1,
            name: 'testuser',
            apprise: null,
            alias: 'Test User',
            discord_id: '123456789',
            notify_discord: true,
            notify_apprise: false,
            notify_tautulli: false,
            tautulli_notifier_id: null,
            can_sync: true,
          },
          notification: mockNotification,
        }

        const itemByUserId = new Map()

        await processIndividualNotification(
          mockFastify,
          publicResult,
          [publicResult, realUserResult], // Include real users for @ mentions
          itemByUserId,
          mockMediaInfo,
        )

        expect(sendPublicNotificationSpy).toHaveBeenCalledWith(
          mockNotification,
          ['123456789'], // Discord IDs extracted from real users
        )
      })

      it('should send public Apprise notification when user id is -1', async () => {
        const sendPublicNotificationSpy = vi.fn().mockResolvedValue(undefined)

        const mockFastify = {
          log: createMockLogger(),
          notifications: {
            apprise: {
              isEnabled: vi.fn().mockReturnValue(true),
              sendPublicNotification: sendPublicNotificationSpy,
            },
          },
        } as unknown as FastifyInstance

        const publicResult: NotificationResult = {
          user: {
            id: -1,
            name: 'Public Content',
            apprise: null,
            alias: 'Public Content',
            discord_id: null,
            notify_discord: false,
            notify_apprise: true,
            notify_tautulli: false,
            tautulli_notifier_id: null,
            can_sync: false,
          },
          notification: mockNotification,
        }

        const itemByUserId = new Map()

        await processIndividualNotification(
          mockFastify,
          publicResult,
          [publicResult],
          itemByUserId,
          mockMediaInfo,
        )

        expect(sendPublicNotificationSpy).toHaveBeenCalledWith(mockNotification)
      })

      it('should log error when public Discord notification fails but not throw', async () => {
        const sendPublicNotificationSpy = vi
          .fn()
          .mockRejectedValue(new Error('Discord webhook error'))
        const errorLogSpy = vi.fn()

        const mockLogger = createMockLogger()
        mockLogger.error = errorLogSpy

        const mockFastify = {
          log: mockLogger,
          notifications: {
            discordWebhook: {
              sendPublicNotification: sendPublicNotificationSpy,
            },
          },
        } as unknown as FastifyInstance

        const publicResult: NotificationResult = {
          user: {
            id: -1,
            name: 'Public Content',
            apprise: null,
            alias: 'Public Content',
            discord_id: null,
            notify_discord: true,
            notify_apprise: false,
            notify_tautulli: false,
            tautulli_notifier_id: null,
            can_sync: false,
          },
          notification: mockNotification,
        }

        const itemByUserId = new Map()

        await expect(
          processIndividualNotification(
            mockFastify,
            publicResult,
            [publicResult],
            itemByUserId,
            mockMediaInfo,
          ),
        ).resolves.toBeUndefined()

        expect(errorLogSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.any(Error),
            userId: -1,
          }),
          'Failed to send public Discord notification',
        )
      })

      it('should log error when public Apprise notification fails but not throw', async () => {
        const sendPublicNotificationSpy = vi
          .fn()
          .mockRejectedValue(new Error('Apprise error'))
        const errorLogSpy = vi.fn()

        const mockLogger = createMockLogger()
        mockLogger.error = errorLogSpy

        const mockFastify = {
          log: mockLogger,
          notifications: {
            apprise: {
              isEnabled: vi.fn().mockReturnValue(true),
              sendPublicNotification: sendPublicNotificationSpy,
            },
          },
        } as unknown as FastifyInstance

        const publicResult: NotificationResult = {
          user: {
            id: -1,
            name: 'Public Content',
            apprise: null,
            alias: 'Public Content',
            discord_id: null,
            notify_discord: false,
            notify_apprise: true,
            notify_tautulli: false,
            tautulli_notifier_id: null,
            can_sync: false,
          },
          notification: mockNotification,
        }

        const itemByUserId = new Map()

        await expect(
          processIndividualNotification(
            mockFastify,
            publicResult,
            [publicResult],
            itemByUserId,
            mockMediaInfo,
          ),
        ).resolves.toBeUndefined()

        expect(errorLogSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.any(Error),
            userId: -1,
          }),
          'Failed to send public Apprise notification',
        )
      })
    })

    describe('Multiple notification types', () => {
      it('should send all enabled notification types for a user', async () => {
        const sendDirectMessageSpy = vi.fn().mockResolvedValue(undefined)
        const sendAppriseNotificationSpy = vi.fn().mockResolvedValue(undefined)
        const sendTautulliNotificationSpy = vi.fn().mockResolvedValue(true)

        const mockFastify = {
          log: createMockLogger(),
          notifications: {
            discordBot: {
              sendDirectMessage: sendDirectMessageSpy,
            },
            apprise: {
              isEnabled: vi.fn().mockReturnValue(true),
              sendMediaNotification: sendAppriseNotificationSpy,
            },
            tautulli: {
              isEnabled: vi.fn().mockReturnValue(true),
              sendMediaNotification: sendTautulliNotificationSpy,
            },
          },
        } as unknown as FastifyInstance

        const result: NotificationResult = {
          user: {
            id: 1,
            name: 'testuser',
            apprise: 'apprise://service',
            alias: 'Test User',
            discord_id: '123456789',
            notify_discord: true,
            notify_apprise: true,
            notify_tautulli: true,
            tautulli_notifier_id: 5,
            can_sync: true,
          },
          notification: mockNotification,
        }

        const itemByUserId = new Map([[1, mockWatchlistItem]])

        await processIndividualNotification(
          mockFastify,
          result,
          [result],
          itemByUserId,
          mockMediaInfo,
        )

        // All three should be called
        expect(sendDirectMessageSpy).toHaveBeenCalled()
        expect(sendAppriseNotificationSpy).toHaveBeenCalled()
        expect(sendTautulliNotificationSpy).toHaveBeenCalled()
      })
    })

    describe('Custom logger', () => {
      it('should use custom logger when provided in options', async () => {
        const customLogger = createMockLogger()
        const defaultLogger = createMockLogger()

        const sendDirectMessageSpy = vi
          .fn()
          .mockRejectedValue(new Error('Discord error'))

        const mockFastify = {
          log: defaultLogger,
          notifications: {
            discordBot: {
              sendDirectMessage: sendDirectMessageSpy,
            },
          },
        } as unknown as FastifyInstance

        const result: NotificationResult = {
          user: {
            id: 1,
            name: 'testuser',
            apprise: null,
            alias: 'Test User',
            discord_id: '123456789',
            notify_discord: true,
            notify_apprise: false,
            notify_tautulli: false,
            tautulli_notifier_id: null,
            can_sync: true,
          },
          notification: mockNotification,
        }

        const itemByUserId = new Map([[1, mockWatchlistItem]])

        await processIndividualNotification(
          mockFastify,
          result,
          [result],
          itemByUserId,
          mockMediaInfo,
          {
            logger: customLogger,
          },
        )

        // Custom logger should be used, not default
        expect(customLogger.error).toHaveBeenCalled()
        expect(defaultLogger.error).not.toHaveBeenCalled()
      })
    })
  })
})
