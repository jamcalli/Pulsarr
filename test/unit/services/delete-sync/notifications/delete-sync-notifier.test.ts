/**
 * Unit tests for delete-sync-notifier module
 *
 * Tests notification sending for delete sync operations including Discord
 * and Apprise notifications. Verifies proper handling of notification
 * preferences, dry run mode, and error recovery.
 */

import type { DeleteSyncResult } from '@root/types/delete-sync.types.js'
import type { DeleteSyncNotifierDeps } from '@services/delete-sync/notifications/delete-sync-notifier.js'
import { sendNotificationsIfEnabled } from '@services/delete-sync/notifications/index.js'
import type { NotificationService } from '@services/notification.service.js'
import type { AppriseService } from '@services/notifications/channels/index.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

describe('delete-sync-notifier', () => {
  let mockLogger: ReturnType<typeof createMockLogger>
  let mockNotifications: {
    sendDeleteSyncNotification: ReturnType<typeof vi.fn>
  }
  let mockApprise: {
    isEnabled: ReturnType<typeof vi.fn>
    sendDeleteSyncNotification: ReturnType<typeof vi.fn>
  }
  let baseDeps: DeleteSyncNotifierDeps

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
    mockNotifications = {
      sendDeleteSyncNotification: vi.fn().mockResolvedValue(true),
    }
    mockApprise = {
      isEnabled: vi.fn().mockReturnValue(true),
      sendDeleteSyncNotification: vi.fn().mockResolvedValue(true),
    }
    baseDeps = {
      notifications: mockNotifications as unknown as NotificationService,
      apprise: mockApprise as unknown as AppriseService,
      config: {
        deleteSyncNotify: 'all',
        deleteSyncNotifyOnlyOnDeletion: false,
      },
      logger: mockLogger,
    }
  })

  describe('sendNotificationsIfEnabled', () => {
    it('should skip all notifications when deleteSyncNotify is "none"', async () => {
      const deps = {
        ...baseDeps,
        config: {
          deleteSyncNotify: 'none',
          deleteSyncNotifyOnlyOnDeletion: false,
        },
      }

      await sendNotificationsIfEnabled(deps, createMockResult(), false)

      expect(deps.logger.info).toHaveBeenCalledWith(
        'Delete sync notifications disabled, skipping all notifications',
      )
      expect(
        mockNotifications.sendDeleteSyncNotification,
      ).not.toHaveBeenCalled()
      expect(mockApprise.sendDeleteSyncNotification).not.toHaveBeenCalled()
    })

    it('should skip notifications when deleteSyncNotifyOnlyOnDeletion is true and no deletions occurred', async () => {
      const deps = {
        ...baseDeps,
        config: {
          deleteSyncNotify: 'all',
          deleteSyncNotifyOnlyOnDeletion: true,
        },
      }

      await sendNotificationsIfEnabled(deps, createMockResult(0), false)

      expect(deps.logger.info).toHaveBeenCalledWith(
        'Delete sync completed with no deletions, skipping notification as per configuration',
      )
      expect(
        mockNotifications.sendDeleteSyncNotification,
      ).not.toHaveBeenCalled()
      expect(mockApprise.sendDeleteSyncNotification).not.toHaveBeenCalled()
    })

    it('should send Discord notification for "all" setting', async () => {
      const result = createMockResult()

      await sendNotificationsIfEnabled(baseDeps, result, false)

      expect(mockNotifications.sendDeleteSyncNotification).toHaveBeenCalledWith(
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
      const deps = {
        ...baseDeps,
        config: {
          deleteSyncNotify: 'discord-only',
          deleteSyncNotifyOnlyOnDeletion: false,
        },
      }
      const result = createMockResult()

      await sendNotificationsIfEnabled(deps, result, false)

      expect(mockNotifications.sendDeleteSyncNotification).toHaveBeenCalledWith(
        result,
        false,
        'discord-only',
      )
      expect(mockApprise.sendDeleteSyncNotification).not.toHaveBeenCalled()
    })

    it('should send Discord notification for "discord-webhook" setting', async () => {
      const deps = {
        ...baseDeps,
        config: {
          deleteSyncNotify: 'discord-webhook',
          deleteSyncNotifyOnlyOnDeletion: false,
        },
      }
      const result = createMockResult()

      await sendNotificationsIfEnabled(deps, result, false)

      expect(mockNotifications.sendDeleteSyncNotification).toHaveBeenCalledWith(
        result,
        false,
        'discord-webhook',
      )
      expect(mockApprise.sendDeleteSyncNotification).not.toHaveBeenCalled()
    })

    it('should send Discord notification for "discord-message" setting', async () => {
      const deps = {
        ...baseDeps,
        config: {
          deleteSyncNotify: 'discord-message',
          deleteSyncNotifyOnlyOnDeletion: false,
        },
      }
      const result = createMockResult()

      await sendNotificationsIfEnabled(deps, result, false)

      expect(mockNotifications.sendDeleteSyncNotification).toHaveBeenCalledWith(
        result,
        false,
        'discord-message',
      )
      expect(mockApprise.sendDeleteSyncNotification).not.toHaveBeenCalled()
    })

    it('should send Discord notification for "discord-both" setting', async () => {
      const deps = {
        ...baseDeps,
        config: {
          deleteSyncNotify: 'discord-both',
          deleteSyncNotifyOnlyOnDeletion: false,
        },
      }
      const result = createMockResult()

      await sendNotificationsIfEnabled(deps, result, false)

      expect(mockNotifications.sendDeleteSyncNotification).toHaveBeenCalledWith(
        result,
        false,
        'discord-both',
      )
      expect(mockApprise.sendDeleteSyncNotification).not.toHaveBeenCalled()
    })

    it('should send Discord notification for legacy "webhook" setting', async () => {
      const deps = {
        ...baseDeps,
        config: {
          deleteSyncNotify: 'webhook',
          deleteSyncNotifyOnlyOnDeletion: false,
        },
      }
      const result = createMockResult()

      await sendNotificationsIfEnabled(deps, result, false)

      expect(mockNotifications.sendDeleteSyncNotification).toHaveBeenCalledWith(
        result,
        false,
        'webhook',
      )
      expect(mockApprise.sendDeleteSyncNotification).not.toHaveBeenCalled()
    })

    it('should send Discord notification for legacy "message" setting', async () => {
      const deps = {
        ...baseDeps,
        config: {
          deleteSyncNotify: 'message',
          deleteSyncNotifyOnlyOnDeletion: false,
        },
      }
      const result = createMockResult()

      await sendNotificationsIfEnabled(deps, result, false)

      expect(mockNotifications.sendDeleteSyncNotification).toHaveBeenCalledWith(
        result,
        false,
        'message',
      )
      expect(mockApprise.sendDeleteSyncNotification).not.toHaveBeenCalled()
    })

    it('should send Discord notification for legacy "both" setting', async () => {
      const deps = {
        ...baseDeps,
        config: {
          deleteSyncNotify: 'both',
          deleteSyncNotifyOnlyOnDeletion: false,
        },
      }
      const result = createMockResult()

      await sendNotificationsIfEnabled(deps, result, false)

      expect(mockNotifications.sendDeleteSyncNotification).toHaveBeenCalledWith(
        result,
        false,
        'both',
      )
      expect(mockApprise.sendDeleteSyncNotification).not.toHaveBeenCalled()
    })

    it('should send Apprise-only notification for "apprise-only" setting', async () => {
      const deps = {
        ...baseDeps,
        config: {
          deleteSyncNotify: 'apprise-only',
          deleteSyncNotifyOnlyOnDeletion: false,
        },
      }
      const result = createMockResult()

      await sendNotificationsIfEnabled(deps, result, false)

      expect(
        mockNotifications.sendDeleteSyncNotification,
      ).not.toHaveBeenCalled()
      expect(mockApprise.sendDeleteSyncNotification).toHaveBeenCalledWith(
        result,
        false,
      )
    })

    it('should not send Discord notification when discord service is null', async () => {
      const deps = {
        ...baseDeps,
        notifications: null,
      }
      const result = createMockResult()

      await sendNotificationsIfEnabled(deps, result, false)

      expect(mockApprise.sendDeleteSyncNotification).toHaveBeenCalledWith(
        result,
        false,
      )
    })

    it('should not send Apprise notification when apprise service is null', async () => {
      const deps = {
        ...baseDeps,
        apprise: null,
      }
      const result = createMockResult()

      await sendNotificationsIfEnabled(deps, result, false)

      expect(mockNotifications.sendDeleteSyncNotification).toHaveBeenCalledWith(
        result,
        false,
        'all',
      )
    })

    it('should not send Apprise notification when apprise service is disabled', async () => {
      mockApprise.isEnabled.mockReturnValue(false)
      const result = createMockResult()

      await sendNotificationsIfEnabled(baseDeps, result, false)

      expect(mockNotifications.sendDeleteSyncNotification).toHaveBeenCalledWith(
        result,
        false,
        'all',
      )
      expect(mockApprise.sendDeleteSyncNotification).not.toHaveBeenCalled()
    })

    it('should handle Discord send errors gracefully', async () => {
      mockNotifications.sendDeleteSyncNotification.mockRejectedValue(
        new Error('Discord send failed'),
      )
      const result = createMockResult()

      await sendNotificationsIfEnabled(baseDeps, result, false)

      expect(mockNotifications.sendDeleteSyncNotification).toHaveBeenCalled()
      expect(baseDeps.logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(Error),
        }),
        'Error sending delete sync Discord notification:',
      )
      // Should still send Apprise notification
      expect(mockApprise.sendDeleteSyncNotification).toHaveBeenCalled()
    })

    it('should handle Apprise send errors gracefully', async () => {
      mockApprise.sendDeleteSyncNotification.mockRejectedValue(
        new Error('Apprise send failed'),
      )
      const result = createMockResult()

      await sendNotificationsIfEnabled(baseDeps, result, false)

      expect(mockApprise.sendDeleteSyncNotification).toHaveBeenCalled()
      expect(baseDeps.logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(Error),
        }),
        'Error sending delete sync Apprise notification:',
      )
      // Should still have sent Discord notification
      expect(mockNotifications.sendDeleteSyncNotification).toHaveBeenCalled()
    })

    it('should pass dryRun flag correctly to notification services', async () => {
      const result = createMockResult()

      await sendNotificationsIfEnabled(baseDeps, result, true)

      expect(mockNotifications.sendDeleteSyncNotification).toHaveBeenCalledWith(
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
