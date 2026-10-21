import type { ApprovalRequest } from '@root/types/approval.types.js'
import type { DiscordEmbed } from '@root/types/discord.types.js'
import type { WatchlistCapNotification } from '@root/types/notification.types.js'
import {
  createApprovalMessages,
  createDeleteSyncMessage,
  createUpdateAvailableMessage,
  createUserWatchlistCapMessage,
  createWatchlistAddedMessage,
  createWatchlistCapMessage,
} from '@services/notifications/templates/messages.js'
import { describe, expect, it } from 'vitest'
import { createMockUser } from '../../../../mocks/user.js'

function fieldValue(embed: DiscordEmbed, name: string): string | undefined {
  return embed.fields?.find((field) => field.name === name)?.value
}

const CAP_EVENT: WatchlistCapNotification = {
  userId: 3,
  userName: 'test-user-all-notifications',
  contentType: 'show',
  currentCount: 6,
  cap: 5,
}

describe('messages', () => {
  describe('createApprovalMessages', () => {
    const request: ApprovalRequest = {
      id: 1,
      userId: 2,
      userName: 'friend',
      contentType: 'movie',
      contentTitle: 'Nosferatu',
      contentKey: 'nosferatu-key',
      contentGuids: ['tmdb:426063'],
      thumb: null,
      proposedRouterDecision: { action: 'require_approval' },
      triggeredBy: 'manual_flag',
      approvalReason: null,
      status: 'pending',
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-01T10:00:00.000Z',
    }

    it('should name the requester by alias in the embed, DM and Apprise rows', () => {
      const users = new Map([
        [2, createMockUser(2, 'friend', { alias: 'Friendly' })],
      ])
      const { dm, requests } = createApprovalMessages(
        [request],
        1,
        new Map(),
        users,
      )
      const embed = requests[0].webhook.embeds?.[0]

      expect(embed && fieldValue(embed, 'Requested by')).toBe('Friendly')
      expect(fieldValue(dm.embed, 'Requested by')).toBe('Friendly')
      expect(requests[0].apprise.body).toContain('Friendly')
    })

    it('should fall back to the request user name without a user row', () => {
      const { dm, requests } = createApprovalMessages(
        [request],
        1,
        new Map(),
        new Map(),
      )
      const embed = requests[0].webhook.embeds?.[0]

      expect(embed && fieldValue(embed, 'Requested by')).toBe('friend')
      expect(fieldValue(dm.embed, 'Requested by')).toBe('friend')
      expect(requests[0].apprise.body).toContain('friend')
    })
  })

  describe('createDeleteSyncMessage', () => {
    const results = {
      total: { deleted: 1, skipped: 1, processed: 2 },
      movies: {
        deleted: 1,
        skipped: 1,
        items: [
          {
            title: 'Metropolis',
            guid: 'imdb:tt0017136',
            instance: 'Radarr Main',
          },
        ],
      },
      shows: { deleted: 0, skipped: 0, items: [] },
      safetyTriggered: false,
    }

    it('should post the results embed as the delete sync webhook', () => {
      const { webhook } = createDeleteSyncMessage(results, false)
      const embed = webhook.embeds?.[0]

      expect(webhook.username).toBe('Pulsarr Delete Sync')
      expect(embed?.title).toBe('Delete sync results')
      expect(embed && fieldValue(embed, 'Movies (1 deleted)')).toBe(
        '• Metropolis',
      )
    })

    it('should reuse the embed title and fields in a system DM', () => {
      const { webhook, dm } = createDeleteSyncMessage(results, false)

      expect(dm.embed.title).toBe('Delete sync results')
      expect(dm.embed.description).toBe('System notification')
      expect(dm.embed.fields).toEqual(webhook.embeds?.[0].fields)
    })

    it('should title the Apprise message and list the deleted movie', () => {
      const { apprise } = createDeleteSyncMessage(results, false)

      expect(apprise.title).toBe('Delete sync results')
      expect(apprise.body).toContain('Metropolis')
    })
  })

  describe('createUpdateAvailableMessage', () => {
    const release = {
      currentVersion: '0.19.7',
      latestVersion: '0.20.0',
      releaseUrl: 'https://github.com/jamcalli/Pulsarr/releases/tag/v0.20.0',
      releaseName: 'v0.20.0',
      releaseBody: 'Bug fixes and improvements',
      releaseBodyHtml: '<p>Bug fixes and improvements</p>',
      publishedAt: '2026-10-01T12:00:00Z',
    }

    it('should block mentions in the update webhook', () => {
      const { webhook } = createUpdateAvailableMessage(release)

      expect(webhook.username).toBe('Pulsarr Updates')
      expect(webhook.allowed_mentions).toEqual({ parse: [] })
      expect(webhook.embeds?.[0].title).toBe('Update available: v0.20.0')
    })

    it('should DM the same embed and title Apprise by version', () => {
      const { webhook, dm, apprise } = createUpdateAvailableMessage(release)

      expect(dm.embed).toEqual(webhook.embeds?.[0])
      expect(apprise.title).toBe('Update available: Pulsarr 0.20.0')
      expect(apprise.body).toContain(release.releaseUrl)
    })
  })

  describe('createWatchlistAddedMessage', () => {
    const notification = {
      type: 'movie' as const,
      title: 'Nosferatu',
      username: 'test-user-discord-apprise',
      tmdbUrl: 'https://www.themoviedb.org/movie/426063',
    }

    it('should credit the adding user in the webhook and DM embed', () => {
      const { webhook, dm } = createWatchlistAddedMessage(
        notification,
        'Discord+Apprise User',
      )
      const embed = webhook.embeds?.[0]

      expect(webhook.username).toBe('Pulsarr')
      expect(embed?.title).toBe('Watchlist add: Nosferatu')
      expect(embed?.description).toBeUndefined()
      expect(embed?.footer?.text).toBe('Added by Discord+Apprise User')
      expect(embed && fieldValue(embed, 'More Info')).toBe(
        '[View on TMDB](https://www.themoviedb.org/movie/426063)',
      )
      expect(dm.embed).toEqual(embed)
    })

    it('should title the Apprise message by type and name the user', () => {
      const { apprise } = createWatchlistAddedMessage(
        notification,
        'Discord+Apprise User',
      )

      expect(apprise.title).toBe('Watchlist add: Nosferatu')
      expect(apprise.body).toContain('Discord+Apprise User')
    })
  })

  describe('createWatchlistCapMessage', () => {
    it('should post the cap usage as the watchlist webhook', () => {
      const { webhook } = createWatchlistCapMessage(
        CAP_EVENT,
        'test-user-all-notifications',
      )
      const embed = webhook.embeds?.[0]

      expect(webhook.username).toBe('Pulsarr Watchlist')
      expect(embed?.title).toBe(
        'Watchlist cap reached: test-user-all-notifications',
      )
      expect(embed?.description).toBe(
        '**test-user-all-notifications** reached their show cap (6/5)',
      )
      expect(embed && fieldValue(embed, 'Usage')).toBe('6 / 5')
      expect(embed?.footer?.text).toBe(
        'New items wait until the cap is raised or items are removed.',
      )
    })

    it('should add the impact as a DM field', () => {
      const { dm } = createWatchlistCapMessage(
        CAP_EVENT,
        'test-user-all-notifications',
      )

      expect(dm.embed.title).toBe(
        'Watchlist cap reached: test-user-all-notifications',
      )
      expect(fieldValue(dm.embed, 'Content Type')).toBe('Show')
      expect(fieldValue(dm.embed, 'Impact')).toBe(
        'New items wait until the cap is raised or items are removed.',
      )
    })

    it('should name the user in the Apprise message', () => {
      const { apprise } = createWatchlistCapMessage(CAP_EVENT, 'User 3')

      expect(apprise.title).toBe('Watchlist cap reached: User 3')
      expect(apprise.body).toContain('User 3')
    })

    it('should name the user by alias in every admin form', () => {
      const { webhook, dm, apprise } = createWatchlistCapMessage(
        CAP_EVENT,
        'Alex',
      )
      const embed = webhook.embeds?.[0]

      expect(embed?.title).toBe('Watchlist cap reached: Alex')
      expect(embed?.description).toBe('**Alex** reached their show cap (6/5)')
      expect(embed && fieldValue(embed, 'User')).toBe('Alex')
      expect(dm.embed.title).toBe('Watchlist cap reached: Alex')
      expect(apprise.title).toBe('Watchlist cap reached: Alex')
    })
  })

  describe('createUserWatchlistCapMessage', () => {
    it('should address the capped user by display name', () => {
      const { dm, apprise } = createUserWatchlistCapMessage(CAP_EVENT, 'Alex')

      expect(dm.embed.title).toBe('Watchlist cap reached')
      expect(fieldValue(dm.embed, 'Notice')).toBe(
        "Alex, you've reached your show watchlist cap (6/5). New show items won't be processed until the cap is raised or existing items are removed.",
      )
      expect(apprise.title).toBe('Watchlist cap reached: Alex')
      expect(apprise.body).toContain('Alex')
    })
  })
})
