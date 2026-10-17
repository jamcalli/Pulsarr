vi.mock('@services/notifications/channels/native-webhook.js', () => ({
  dispatchWebhooks: vi
    .fn()
    .mockResolvedValue({ dispatched: 0, succeeded: 0, failed: 0, results: [] }),
}))

import type { Config } from '@root/types/config.types.js'
import type { DeleteSyncResult } from '@root/types/delete-sync.types.js'
import { sendDeleteSyncNotification } from '@services/notifications/orchestration/delete-sync.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createNotificationDeps } from '../../../../mocks/notification-deps.js'
import { createMockUser } from '../../../../mocks/user.js'

describe('delete-sync orchestration', () => {
  let fakes: ReturnType<typeof createNotificationDeps>
  let mockDiscordBot: ReturnType<typeof createNotificationDeps>['discordBot']
  let mockDiscordWebhook: ReturnType<
    typeof createNotificationDeps
  >['discordWebhook']
  let mockApprise: ReturnType<typeof createNotificationDeps>['apprise']
  let mockDb: ReturnType<typeof createNotificationDeps>['db']
  let baseDeps: ReturnType<typeof createNotificationDeps>['deps']

  function createMockResult(deletedCount = 5): DeleteSyncResult {
    return {
      movies: { deleted: 2, skipped: 0, items: [] },
      shows: { deleted: 3, skipped: 0, items: [] },
      total: { deleted: deletedCount, skipped: 0, processed: deletedCount },
    }
  }

  function withConfig(config: Partial<Config>) {
    return { ...baseDeps, config: { ...baseDeps.config, ...config } }
  }

  beforeEach(() => {
    fakes = createNotificationDeps({
      deleteSyncNotify: 'all',
      deleteSyncNotifyOnlyOnDeletion: false,
    })
    mockDiscordBot = fakes.discordBot
    mockDiscordWebhook = fakes.discordWebhook
    mockApprise = fakes.apprise
    mockDb = fakes.db
    baseDeps = fakes.deps
  })

  describe('sendDeleteSyncNotification', () => {
    it('should skip all notifications when deleteSyncNotify is "none"', async () => {
      const deps = withConfig({
        deleteSyncNotify: 'none',
      })

      const result = await sendDeleteSyncNotification(
        deps,
        createMockResult(),
        false,
      )

      expect(result).toBe(false)
      expect(mockDiscordWebhook.sendNotification).not.toHaveBeenCalled()
      expect(mockDiscordBot.sendNotification).not.toHaveBeenCalled()
      expect(mockApprise.sendNotification).not.toHaveBeenCalled()
    })

    it('should skip notifications when deleteSyncNotifyOnlyOnDeletion is true and no deletions occurred', async () => {
      const deps = withConfig({
        deleteSyncNotify: 'all',
        deleteSyncNotifyOnlyOnDeletion: true,
      })

      const result = await sendDeleteSyncNotification(
        deps,
        createMockResult(0),
        false,
      )

      expect(result).toBe(false)
      expect(mockDiscordWebhook.sendNotification).not.toHaveBeenCalled()
      expect(mockDiscordBot.sendNotification).not.toHaveBeenCalled()
      expect(mockApprise.sendNotification).not.toHaveBeenCalled()
    })

    it('should send all notifications for "all" setting', async () => {
      const syncResult = createMockResult()

      const result = await sendDeleteSyncNotification(
        baseDeps,
        syncResult,
        false,
      )

      expect(result).toBe(true)
      expect(mockDiscordWebhook.sendNotification).toHaveBeenCalled()
      expect(mockDiscordBot.sendNotification).toHaveBeenCalled()
      expect(mockApprise.sendNotification).toHaveBeenCalledWith(
        'tgram://system/chat',
        expect.objectContaining({ type: 'success' }),
      )
    })

    it('should send webhook-only for "discord-webhook" setting', async () => {
      const deps = withConfig({
        deleteSyncNotify: 'discord-webhook',
      })

      await sendDeleteSyncNotification(deps, createMockResult(), false)

      expect(mockDiscordWebhook.sendNotification).toHaveBeenCalled()
      expect(mockDiscordBot.sendNotification).not.toHaveBeenCalled()
      expect(mockApprise.sendNotification).not.toHaveBeenCalled()
    })

    it('should send DM-only for "discord-message" setting', async () => {
      const deps = withConfig({
        deleteSyncNotify: 'discord-message',
      })

      await sendDeleteSyncNotification(deps, createMockResult(), false)

      expect(mockDiscordWebhook.sendNotification).not.toHaveBeenCalled()
      expect(mockDiscordBot.sendNotification).toHaveBeenCalled()
      expect(mockApprise.sendNotification).not.toHaveBeenCalled()
    })

    it('should send both Discord channels for "discord-both" setting', async () => {
      const deps = withConfig({
        deleteSyncNotify: 'discord-both',
      })

      await sendDeleteSyncNotification(deps, createMockResult(), false)

      expect(mockDiscordWebhook.sendNotification).toHaveBeenCalled()
      expect(mockDiscordBot.sendNotification).toHaveBeenCalled()
      expect(mockApprise.sendNotification).not.toHaveBeenCalled()
    })

    it('should send Apprise-only for "apprise-only" setting', async () => {
      const deps = withConfig({
        deleteSyncNotify: 'apprise-only',
      })

      await sendDeleteSyncNotification(deps, createMockResult(), false)

      expect(mockDiscordWebhook.sendNotification).not.toHaveBeenCalled()
      expect(mockDiscordBot.sendNotification).not.toHaveBeenCalled()
      expect(mockApprise.sendNotification).toHaveBeenCalled()
    })

    it('should handle legacy "webhook" setting', async () => {
      const deps = withConfig({
        deleteSyncNotify: 'webhook',
      })

      await sendDeleteSyncNotification(deps, createMockResult(), false)

      expect(mockDiscordWebhook.sendNotification).toHaveBeenCalled()
      expect(mockDiscordBot.sendNotification).not.toHaveBeenCalled()
    })

    it('should handle legacy "message" setting', async () => {
      const deps = withConfig({
        deleteSyncNotify: 'message',
      })

      await sendDeleteSyncNotification(deps, createMockResult(), false)

      expect(mockDiscordWebhook.sendNotification).not.toHaveBeenCalled()
      expect(mockDiscordBot.sendNotification).toHaveBeenCalled()
    })

    it('should handle legacy "both" setting', async () => {
      const deps = withConfig({
        deleteSyncNotify: 'both',
      })

      await sendDeleteSyncNotification(deps, createMockResult(), false)

      expect(mockDiscordWebhook.sendNotification).toHaveBeenCalled()
      expect(mockDiscordBot.sendNotification).toHaveBeenCalled()
    })

    it('should send the webhook to the configured admin URL', async () => {
      const deps = withConfig({
        deleteSyncNotify: 'discord-webhook',
      })

      await sendDeleteSyncNotification(deps, createMockResult(), false)

      expect(mockDiscordWebhook.sendNotification).toHaveBeenCalledWith(
        'https://discord.com/webhook/test',
        expect.objectContaining({ username: 'Pulsarr Delete Sync' }),
      )
    })

    it('should not send DM when admin user has no Discord ID', async () => {
      mockDb.getPrimaryUser.mockResolvedValue(
        createMockUser(1, 'admin', { is_primary_token: true }),
      )
      const deps = withConfig({
        deleteSyncNotify: 'discord-message',
      })

      await sendDeleteSyncNotification(deps, createMockResult(), false)

      expect(mockDiscordBot.sendNotification).not.toHaveBeenCalled()
    })

    it('should handle webhook send errors gracefully', async () => {
      mockDiscordWebhook.sendNotification.mockRejectedValue(
        new Error('Webhook send failed'),
      )

      const result = await sendDeleteSyncNotification(
        baseDeps,
        createMockResult(),
        false,
      )

      expect(result).toBe(true)
    })

    it('should handle Apprise send errors gracefully', async () => {
      mockApprise.sendNotification.mockRejectedValue(
        new Error('Apprise send failed'),
      )

      const result = await sendDeleteSyncNotification(
        baseDeps,
        createMockResult(),
        false,
      )

      expect(result).toBe(true)
    })

    it('should send a dry run to Apprise as an info message', async () => {
      await sendDeleteSyncNotification(baseDeps, createMockResult(), true)

      expect(mockApprise.sendNotification).toHaveBeenCalledWith(
        'tgram://system/chat',
        expect.objectContaining({
          title: '🔍 Delete Sync Simulation Results',
          type: 'info',
        }),
      )
    })
  })
})
