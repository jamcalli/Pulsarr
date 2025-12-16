/**
 * Unit tests for delete-sync orchestration module
 *
 * Tests notification sending for delete sync operations including Discord
 * (webhook and DM) and Apprise notifications. Verifies proper handling of
 * notification preferences, dry run mode, and error recovery.
 */

import type { DeleteSyncResult } from '@root/types/delete-sync.types.js'
import type { DatabaseService } from '@services/database.service.js'
import type { AppriseService } from '@services/notifications/channels/apprise.service.js'
import type { DiscordWebhookService } from '@services/notifications/channels/discord-webhook.service.js'
import type { DiscordBotService } from '@services/notifications/discord-bot/bot.service.js'
import {
  type DeleteSyncDeps,
  sendDeleteSyncCompleted,
} from '@services/notifications/orchestration/delete-sync.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

describe('delete-sync orchestration', () => {
  let mockLogger: ReturnType<typeof createMockLogger>
  let mockDiscordBot: {
    sendDirectMessage: ReturnType<typeof vi.fn>
  }
  let mockDiscordWebhook: {
    sendNotification: ReturnType<typeof vi.fn>
  }
  let mockApprise: {
    isEnabled: ReturnType<typeof vi.fn>
    sendDeleteSyncNotification: ReturnType<typeof vi.fn>
  }
  let mockDb: {
    getAllUsers: ReturnType<typeof vi.fn>
  }
  let baseDeps: DeleteSyncDeps

  /**
   * Helper to create mock DeleteSyncResult
   */
  function createMockResult(deletedCount = 5): DeleteSyncResult {
    return {
      movies: { deleted: 2, skipped: 0, items: [] },
      shows: { deleted: 3, skipped: 0, items: [] },
      total: { deleted: deletedCount, skipped: 0, processed: deletedCount },
    }
  }

  beforeEach(() => {
    mockLogger = createMockLogger()
    mockDiscordBot = {
      sendDirectMessage: vi.fn().mockResolvedValue(true),
    }
    mockDiscordWebhook = {
      sendNotification: vi.fn().mockResolvedValue(true),
    }
    mockApprise = {
      isEnabled: vi.fn().mockReturnValue(true),
      sendDeleteSyncNotification: vi.fn().mockResolvedValue(true),
    }
    mockDb = {
      getAllUsers: vi
        .fn()
        .mockResolvedValue([
          {
            id: 1,
            name: 'Admin',
            is_primary_token: true,
            discord_id: '123456',
          },
        ]),
    }
    baseDeps = {
      db: mockDb as unknown as DatabaseService,
      logger: mockLogger,
      discordBot: mockDiscordBot as unknown as DiscordBotService,
      discordWebhook: mockDiscordWebhook as unknown as DiscordWebhookService,
      apprise: mockApprise as unknown as AppriseService,
      config: {
        deleteSyncNotify: 'all',
        deleteSyncNotifyOnlyOnDeletion: false,
        discordWebhookUrl: 'https://discord.com/webhook/test',
      },
    }
  })

  describe('sendDeleteSyncCompleted', () => {
    it('should skip all notifications when deleteSyncNotify is "none"', async () => {
      const deps = {
        ...baseDeps,
        config: {
          ...baseDeps.config,
          deleteSyncNotify: 'none',
        },
      }

      const result = await sendDeleteSyncCompleted(
        deps,
        createMockResult(),
        false,
      )

      expect(result).toBe(false)
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Delete sync notifications disabled, skipping all notifications',
      )
      expect(mockDiscordWebhook.sendNotification).not.toHaveBeenCalled()
      expect(mockDiscordBot.sendDirectMessage).not.toHaveBeenCalled()
      expect(mockApprise.sendDeleteSyncNotification).not.toHaveBeenCalled()
    })

    it('should skip notifications when deleteSyncNotifyOnlyOnDeletion is true and no deletions occurred', async () => {
      const deps = {
        ...baseDeps,
        config: {
          ...baseDeps.config,
          deleteSyncNotify: 'all',
          deleteSyncNotifyOnlyOnDeletion: true,
        },
      }

      const result = await sendDeleteSyncCompleted(
        deps,
        createMockResult(0),
        false,
      )

      expect(result).toBe(false)
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Delete sync completed with no deletions, skipping notification as per configuration',
      )
      expect(mockDiscordWebhook.sendNotification).not.toHaveBeenCalled()
      expect(mockDiscordBot.sendDirectMessage).not.toHaveBeenCalled()
      expect(mockApprise.sendDeleteSyncNotification).not.toHaveBeenCalled()
    })

    it('should send all notifications for "all" setting', async () => {
      const syncResult = createMockResult()

      const result = await sendDeleteSyncCompleted(baseDeps, syncResult, false)

      expect(result).toBe(true)
      expect(mockDiscordWebhook.sendNotification).toHaveBeenCalled()
      expect(mockDiscordBot.sendDirectMessage).toHaveBeenCalled()
      expect(mockApprise.sendDeleteSyncNotification).toHaveBeenCalledWith(
        syncResult,
        false,
      )
    })

    it('should send webhook-only for "discord-webhook" setting', async () => {
      const deps = {
        ...baseDeps,
        config: {
          ...baseDeps.config,
          deleteSyncNotify: 'discord-webhook',
        },
      }

      await sendDeleteSyncCompleted(deps, createMockResult(), false)

      expect(mockDiscordWebhook.sendNotification).toHaveBeenCalled()
      expect(mockDiscordBot.sendDirectMessage).not.toHaveBeenCalled()
      expect(mockApprise.sendDeleteSyncNotification).not.toHaveBeenCalled()
    })

    it('should send DM-only for "discord-message" setting', async () => {
      const deps = {
        ...baseDeps,
        config: {
          ...baseDeps.config,
          deleteSyncNotify: 'discord-message',
        },
      }

      await sendDeleteSyncCompleted(deps, createMockResult(), false)

      expect(mockDiscordWebhook.sendNotification).not.toHaveBeenCalled()
      expect(mockDiscordBot.sendDirectMessage).toHaveBeenCalled()
      expect(mockApprise.sendDeleteSyncNotification).not.toHaveBeenCalled()
    })

    it('should send both Discord channels for "discord-both" setting', async () => {
      const deps = {
        ...baseDeps,
        config: {
          ...baseDeps.config,
          deleteSyncNotify: 'discord-both',
        },
      }

      await sendDeleteSyncCompleted(deps, createMockResult(), false)

      expect(mockDiscordWebhook.sendNotification).toHaveBeenCalled()
      expect(mockDiscordBot.sendDirectMessage).toHaveBeenCalled()
      expect(mockApprise.sendDeleteSyncNotification).not.toHaveBeenCalled()
    })

    it('should send Apprise-only for "apprise-only" setting', async () => {
      const deps = {
        ...baseDeps,
        config: {
          ...baseDeps.config,
          deleteSyncNotify: 'apprise-only',
        },
      }

      await sendDeleteSyncCompleted(deps, createMockResult(), false)

      expect(mockDiscordWebhook.sendNotification).not.toHaveBeenCalled()
      expect(mockDiscordBot.sendDirectMessage).not.toHaveBeenCalled()
      expect(mockApprise.sendDeleteSyncNotification).toHaveBeenCalled()
    })

    it('should handle legacy "webhook" setting', async () => {
      const deps = {
        ...baseDeps,
        config: {
          ...baseDeps.config,
          deleteSyncNotify: 'webhook',
        },
      }

      await sendDeleteSyncCompleted(deps, createMockResult(), false)

      expect(mockDiscordWebhook.sendNotification).toHaveBeenCalled()
      expect(mockDiscordBot.sendDirectMessage).not.toHaveBeenCalled()
    })

    it('should handle legacy "message" setting', async () => {
      const deps = {
        ...baseDeps,
        config: {
          ...baseDeps.config,
          deleteSyncNotify: 'message',
        },
      }

      await sendDeleteSyncCompleted(deps, createMockResult(), false)

      expect(mockDiscordWebhook.sendNotification).not.toHaveBeenCalled()
      expect(mockDiscordBot.sendDirectMessage).toHaveBeenCalled()
    })

    it('should handle legacy "both" setting', async () => {
      const deps = {
        ...baseDeps,
        config: {
          ...baseDeps.config,
          deleteSyncNotify: 'both',
        },
      }

      await sendDeleteSyncCompleted(deps, createMockResult(), false)

      expect(mockDiscordWebhook.sendNotification).toHaveBeenCalled()
      expect(mockDiscordBot.sendDirectMessage).toHaveBeenCalled()
    })

    it('should not send webhook when URL is not configured', async () => {
      const deps = {
        ...baseDeps,
        config: {
          ...baseDeps.config,
          deleteSyncNotify: 'discord-webhook',
          discordWebhookUrl: undefined,
        },
      }

      await sendDeleteSyncCompleted(deps, createMockResult(), false)

      expect(mockDiscordWebhook.sendNotification).not.toHaveBeenCalled()
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Discord webhook URL not configured, cannot send webhook notification',
      )
    })

    it('should not send DM when admin user has no Discord ID', async () => {
      mockDb.getAllUsers.mockResolvedValue([
        { id: 1, name: 'Admin', is_primary_token: true, discord_id: null },
      ])
      const deps = {
        ...baseDeps,
        config: {
          ...baseDeps.config,
          deleteSyncNotify: 'discord-message',
        },
      }

      await sendDeleteSyncCompleted(deps, createMockResult(), false)

      expect(mockDiscordBot.sendDirectMessage).not.toHaveBeenCalled()
    })

    it('should not send Apprise notification when apprise service is disabled', async () => {
      mockApprise.isEnabled.mockReturnValue(false)

      await sendDeleteSyncCompleted(baseDeps, createMockResult(), false)

      expect(mockApprise.sendDeleteSyncNotification).not.toHaveBeenCalled()
    })

    it('should handle webhook send errors gracefully', async () => {
      mockDiscordWebhook.sendNotification.mockRejectedValue(
        new Error('Webhook send failed'),
      )

      const result = await sendDeleteSyncCompleted(
        baseDeps,
        createMockResult(),
        false,
      )

      // Should still succeed because other channels worked
      expect(result).toBe(true)
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        'Error sending delete sync webhook notification',
      )
    })

    it('should handle Apprise send errors gracefully', async () => {
      mockApprise.sendDeleteSyncNotification.mockRejectedValue(
        new Error('Apprise send failed'),
      )

      const result = await sendDeleteSyncCompleted(
        baseDeps,
        createMockResult(),
        false,
      )

      // Should still succeed because other channels worked
      expect(result).toBe(true)
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        'Error sending delete sync Apprise notification',
      )
    })

    it('should pass dryRun flag to Apprise service', async () => {
      const syncResult = createMockResult()

      await sendDeleteSyncCompleted(baseDeps, syncResult, true)

      expect(mockApprise.sendDeleteSyncNotification).toHaveBeenCalledWith(
        syncResult,
        true,
      )
    })
  })
})
