import type { DeleteSyncResult } from '@root/types/delete-sync.types.js'
import type { DeleteSyncNotifierDeps } from '@services/delete-sync/notifications/delete-sync-notifier.js'
import { sendNotificationsIfEnabled } from '@services/delete-sync/notifications/index.js'
import type { FastifyBaseLogger } from 'fastify'
import { describe, expect, it, vi } from 'vitest'

describe('delete-sync-notifier', () => {
  const createMockLogger = (): FastifyBaseLogger =>
    ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn(() => createMockLogger()),
    }) as unknown as FastifyBaseLogger

  const createMockDiscordService = (sendSuccess = true) => ({
    sendDeleteSyncNotification: vi.fn().mockImplementation(async () => {
      if (!sendSuccess) {
        throw new Error('Discord send failed')
      }
      return true
    }),
  })

  const createMockAppriseService = (enabled = true, sendSuccess = true) => ({
    isEnabled: vi.fn().mockReturnValue(enabled),
    sendDeleteSyncNotification: vi.fn().mockImplementation(async () => {
      if (!sendSuccess) {
        throw new Error('Apprise send failed')
      }
      return true
    }),
  })

  const createMockResult = (deletedCount = 5): DeleteSyncResult => ({
    movies: { deleted: 2, skipped: 0, items: [] },
    shows: { deleted: 3, skipped: 0, items: [] },
    total: { deleted: deletedCount, skipped: 0, processed: deletedCount },
  })

  describe('sendNotificationsIfEnabled', () => {
    it('should skip all notifications when deleteSyncNotify is "none"', async () => {
      const mockDiscord = createMockDiscordService()
      const mockApprise = createMockAppriseService()
      const deps: DeleteSyncNotifierDeps = {
        discord: mockDiscord as any,
        apprise: mockApprise as any,
        config: {
          deleteSyncNotify: 'none',
          deleteSyncNotifyOnlyOnDeletion: false,
        },
        log: createMockLogger(),
      }

      await sendNotificationsIfEnabled(deps, createMockResult(), false)

      expect(deps.log.info).toHaveBeenCalledWith(
        'Delete sync notifications disabled, skipping all notifications',
      )
      expect(mockDiscord.sendDeleteSyncNotification).not.toHaveBeenCalled()
      expect(mockApprise.sendDeleteSyncNotification).not.toHaveBeenCalled()
    })

    it('should skip notifications when deleteSyncNotifyOnlyOnDeletion is true and no deletions occurred', async () => {
      const mockDiscord = createMockDiscordService()
      const mockApprise = createMockAppriseService()
      const deps: DeleteSyncNotifierDeps = {
        discord: mockDiscord as any,
        apprise: mockApprise as any,
        config: {
          deleteSyncNotify: 'all',
          deleteSyncNotifyOnlyOnDeletion: true,
        },
        log: createMockLogger(),
      }

      await sendNotificationsIfEnabled(deps, createMockResult(0), false)

      expect(deps.log.info).toHaveBeenCalledWith(
        'Delete sync completed with no deletions, skipping notification as per configuration',
      )
      expect(mockDiscord.sendDeleteSyncNotification).not.toHaveBeenCalled()
      expect(mockApprise.sendDeleteSyncNotification).not.toHaveBeenCalled()
    })

    it('should send Discord notification for "all" setting', async () => {
      const mockDiscord = createMockDiscordService()
      const mockApprise = createMockAppriseService()
      const deps: DeleteSyncNotifierDeps = {
        discord: mockDiscord as any,
        apprise: mockApprise as any,
        config: {
          deleteSyncNotify: 'all',
          deleteSyncNotifyOnlyOnDeletion: false,
        },
        log: createMockLogger(),
      }
      const result = createMockResult()

      await sendNotificationsIfEnabled(deps, result, false)

      expect(mockDiscord.sendDeleteSyncNotification).toHaveBeenCalledWith(
        result,
        false,
        'all',
      )
      expect(mockApprise.sendDeleteSyncNotification).toHaveBeenCalledWith(
        result,
        false,
      )
    })

    it('should send Discord-only notification for "discord-only" setting', async () => {
      const mockDiscord = createMockDiscordService()
      const mockApprise = createMockAppriseService()
      const deps: DeleteSyncNotifierDeps = {
        discord: mockDiscord as any,
        apprise: mockApprise as any,
        config: {
          deleteSyncNotify: 'discord-only',
          deleteSyncNotifyOnlyOnDeletion: false,
        },
        log: createMockLogger(),
      }
      const result = createMockResult()

      await sendNotificationsIfEnabled(deps, result, false)

      expect(mockDiscord.sendDeleteSyncNotification).toHaveBeenCalledWith(
        result,
        false,
        'discord-only',
      )
      expect(mockApprise.sendDeleteSyncNotification).not.toHaveBeenCalled()
    })

    it('should send Discord notification for "discord-webhook" setting', async () => {
      const mockDiscord = createMockDiscordService()
      const mockApprise = createMockAppriseService()
      const deps: DeleteSyncNotifierDeps = {
        discord: mockDiscord as any,
        apprise: mockApprise as any,
        config: {
          deleteSyncNotify: 'discord-webhook',
          deleteSyncNotifyOnlyOnDeletion: false,
        },
        log: createMockLogger(),
      }
      const result = createMockResult()

      await sendNotificationsIfEnabled(deps, result, false)

      expect(mockDiscord.sendDeleteSyncNotification).toHaveBeenCalledWith(
        result,
        false,
        'discord-webhook',
      )
      expect(mockApprise.sendDeleteSyncNotification).not.toHaveBeenCalled()
    })

    it('should send Discord notification for "discord-message" setting', async () => {
      const mockDiscord = createMockDiscordService()
      const mockApprise = createMockAppriseService()
      const deps: DeleteSyncNotifierDeps = {
        discord: mockDiscord as any,
        apprise: mockApprise as any,
        config: {
          deleteSyncNotify: 'discord-message',
          deleteSyncNotifyOnlyOnDeletion: false,
        },
        log: createMockLogger(),
      }
      const result = createMockResult()

      await sendNotificationsIfEnabled(deps, result, false)

      expect(mockDiscord.sendDeleteSyncNotification).toHaveBeenCalledWith(
        result,
        false,
        'discord-message',
      )
      expect(mockApprise.sendDeleteSyncNotification).not.toHaveBeenCalled()
    })

    it('should send Discord notification for "discord-both" setting', async () => {
      const mockDiscord = createMockDiscordService()
      const mockApprise = createMockAppriseService()
      const deps: DeleteSyncNotifierDeps = {
        discord: mockDiscord as any,
        apprise: mockApprise as any,
        config: {
          deleteSyncNotify: 'discord-both',
          deleteSyncNotifyOnlyOnDeletion: false,
        },
        log: createMockLogger(),
      }
      const result = createMockResult()

      await sendNotificationsIfEnabled(deps, result, false)

      expect(mockDiscord.sendDeleteSyncNotification).toHaveBeenCalledWith(
        result,
        false,
        'discord-both',
      )
      expect(mockApprise.sendDeleteSyncNotification).not.toHaveBeenCalled()
    })

    it('should send Discord notification for legacy "webhook" setting', async () => {
      const mockDiscord = createMockDiscordService()
      const mockApprise = createMockAppriseService()
      const deps: DeleteSyncNotifierDeps = {
        discord: mockDiscord as any,
        apprise: mockApprise as any,
        config: {
          deleteSyncNotify: 'webhook',
          deleteSyncNotifyOnlyOnDeletion: false,
        },
        log: createMockLogger(),
      }
      const result = createMockResult()

      await sendNotificationsIfEnabled(deps, result, false)

      expect(mockDiscord.sendDeleteSyncNotification).toHaveBeenCalledWith(
        result,
        false,
        'webhook',
      )
      expect(mockApprise.sendDeleteSyncNotification).not.toHaveBeenCalled()
    })

    it('should send Discord notification for legacy "message" setting', async () => {
      const mockDiscord = createMockDiscordService()
      const mockApprise = createMockAppriseService()
      const deps: DeleteSyncNotifierDeps = {
        discord: mockDiscord as any,
        apprise: mockApprise as any,
        config: {
          deleteSyncNotify: 'message',
          deleteSyncNotifyOnlyOnDeletion: false,
        },
        log: createMockLogger(),
      }
      const result = createMockResult()

      await sendNotificationsIfEnabled(deps, result, false)

      expect(mockDiscord.sendDeleteSyncNotification).toHaveBeenCalledWith(
        result,
        false,
        'message',
      )
      expect(mockApprise.sendDeleteSyncNotification).not.toHaveBeenCalled()
    })

    it('should send Discord notification for legacy "both" setting', async () => {
      const mockDiscord = createMockDiscordService()
      const mockApprise = createMockAppriseService()
      const deps: DeleteSyncNotifierDeps = {
        discord: mockDiscord as any,
        apprise: mockApprise as any,
        config: {
          deleteSyncNotify: 'both',
          deleteSyncNotifyOnlyOnDeletion: false,
        },
        log: createMockLogger(),
      }
      const result = createMockResult()

      await sendNotificationsIfEnabled(deps, result, false)

      expect(mockDiscord.sendDeleteSyncNotification).toHaveBeenCalledWith(
        result,
        false,
        'both',
      )
      expect(mockApprise.sendDeleteSyncNotification).not.toHaveBeenCalled()
    })

    it('should send Apprise-only notification for "apprise-only" setting', async () => {
      const mockDiscord = createMockDiscordService()
      const mockApprise = createMockAppriseService()
      const deps: DeleteSyncNotifierDeps = {
        discord: mockDiscord as any,
        apprise: mockApprise as any,
        config: {
          deleteSyncNotify: 'apprise-only',
          deleteSyncNotifyOnlyOnDeletion: false,
        },
        log: createMockLogger(),
      }
      const result = createMockResult()

      await sendNotificationsIfEnabled(deps, result, false)

      expect(mockDiscord.sendDeleteSyncNotification).not.toHaveBeenCalled()
      expect(mockApprise.sendDeleteSyncNotification).toHaveBeenCalledWith(
        result,
        false,
      )
    })

    it('should not send Discord notification when discord service is null', async () => {
      const mockApprise = createMockAppriseService()
      const deps: DeleteSyncNotifierDeps = {
        discord: null,
        apprise: mockApprise as any,
        config: {
          deleteSyncNotify: 'all',
          deleteSyncNotifyOnlyOnDeletion: false,
        },
        log: createMockLogger(),
      }
      const result = createMockResult()

      await sendNotificationsIfEnabled(deps, result, false)

      expect(mockApprise.sendDeleteSyncNotification).toHaveBeenCalledWith(
        result,
        false,
      )
    })

    it('should not send Apprise notification when apprise service is null', async () => {
      const mockDiscord = createMockDiscordService()
      const deps: DeleteSyncNotifierDeps = {
        discord: mockDiscord as any,
        apprise: null,
        config: {
          deleteSyncNotify: 'all',
          deleteSyncNotifyOnlyOnDeletion: false,
        },
        log: createMockLogger(),
      }
      const result = createMockResult()

      await sendNotificationsIfEnabled(deps, result, false)

      expect(mockDiscord.sendDeleteSyncNotification).toHaveBeenCalledWith(
        result,
        false,
        'all',
      )
    })

    it('should not send Apprise notification when apprise service is disabled', async () => {
      const mockDiscord = createMockDiscordService()
      const mockApprise = createMockAppriseService(false) // disabled
      const deps: DeleteSyncNotifierDeps = {
        discord: mockDiscord as any,
        apprise: mockApprise as any,
        config: {
          deleteSyncNotify: 'all',
          deleteSyncNotifyOnlyOnDeletion: false,
        },
        log: createMockLogger(),
      }
      const result = createMockResult()

      await sendNotificationsIfEnabled(deps, result, false)

      expect(mockDiscord.sendDeleteSyncNotification).toHaveBeenCalledWith(
        result,
        false,
        'all',
      )
      expect(mockApprise.sendDeleteSyncNotification).not.toHaveBeenCalled()
    })

    it('should handle Discord send errors gracefully', async () => {
      const mockDiscord = createMockDiscordService(false) // fail
      const mockApprise = createMockAppriseService()
      const deps: DeleteSyncNotifierDeps = {
        discord: mockDiscord as any,
        apprise: mockApprise as any,
        config: {
          deleteSyncNotify: 'all',
          deleteSyncNotifyOnlyOnDeletion: false,
        },
        log: createMockLogger(),
      }
      const result = createMockResult()

      await sendNotificationsIfEnabled(deps, result, false)

      expect(mockDiscord.sendDeleteSyncNotification).toHaveBeenCalled()
      expect(deps.log.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(Error),
        }),
        'Error sending delete sync Discord notification:',
      )
      // Should still send Apprise notification
      expect(mockApprise.sendDeleteSyncNotification).toHaveBeenCalled()
    })

    it('should handle Apprise send errors gracefully', async () => {
      const mockDiscord = createMockDiscordService()
      const mockApprise = createMockAppriseService(true, false) // enabled but fail
      const deps: DeleteSyncNotifierDeps = {
        discord: mockDiscord as any,
        apprise: mockApprise as any,
        config: {
          deleteSyncNotify: 'all',
          deleteSyncNotifyOnlyOnDeletion: false,
        },
        log: createMockLogger(),
      }
      const result = createMockResult()

      await sendNotificationsIfEnabled(deps, result, false)

      expect(mockApprise.sendDeleteSyncNotification).toHaveBeenCalled()
      expect(deps.log.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(Error),
        }),
        'Error sending delete sync Apprise notification:',
      )
      // Should still have sent Discord notification
      expect(mockDiscord.sendDeleteSyncNotification).toHaveBeenCalled()
    })

    it('should pass dryRun flag correctly to notification services', async () => {
      const mockDiscord = createMockDiscordService()
      const mockApprise = createMockAppriseService()
      const deps: DeleteSyncNotifierDeps = {
        discord: mockDiscord as any,
        apprise: mockApprise as any,
        config: {
          deleteSyncNotify: 'all',
          deleteSyncNotifyOnlyOnDeletion: false,
        },
        log: createMockLogger(),
      }
      const result = createMockResult()

      await sendNotificationsIfEnabled(deps, result, true)

      expect(mockDiscord.sendDeleteSyncNotification).toHaveBeenCalledWith(
        result,
        true,
        'all',
      )
      expect(mockApprise.sendDeleteSyncNotification).toHaveBeenCalledWith(
        result,
        true,
      )
    })
  })
})
