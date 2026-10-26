import type { ApprovalRequest } from '@root/types/approval.types.js'
import type { DeleteSyncResult } from '@root/types/delete-sync.types.js'
import type { DiscordEmbed } from '@root/types/discord.types.js'
import {
  createApprovalBatchDm,
  createApprovalRequestEmbed,
  createDeleteSyncEmbed,
  createMediaAddedEmbed,
  createMediaNotificationEmbed,
  createPublicMediaWebhookPayload,
  createSystemDm,
  createUpdateAvailableEmbed,
  createWatchlistCapDm,
  createWatchlistCapEmbed,
} from '@services/notifications/templates/discord-embeds.js'
import { describe, expect, it } from 'vitest'

function fieldValue(embed: DiscordEmbed, name: string): string | undefined {
  return embed.fields?.find((field) => field.name === name)?.value
}

function fieldNames(embed: DiscordEmbed): string[] {
  return embed.fields?.map((field) => field.name) ?? []
}

function deleteSyncResult(
  overrides: Partial<DeleteSyncResult> = {},
): DeleteSyncResult {
  return {
    total: { deleted: 0, skipped: 0, processed: 0 },
    movies: { deleted: 0, skipped: 0, items: [] },
    shows: { deleted: 0, skipped: 0, items: [] },
    ...overrides,
  }
}

function deletedItems(count: number, prefix: string) {
  return Array.from({ length: count }, (_, index) => ({
    title: `${prefix} ${index + 1}`,
    guid: `guid-${index}`,
    instance: 'instance-1',
  }))
}

function approvalRequest(
  overrides: Partial<ApprovalRequest> = {},
): ApprovalRequest {
  return {
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
    ...overrides,
  }
}

describe('discord-embeds', () => {
  describe('createMediaNotificationEmbed', () => {
    it.each([
      [
        'an episode',
        {
          type: 'show',
          title: 'Severance',
          username: 'alice',
          episodeDetails: { seasonNumber: 1, episodeNumber: 2 },
        },
        'New episode available: Severance',
      ],
      [
        'a season',
        {
          type: 'show',
          title: 'Severance',
          username: 'alice',
          episodeDetails: { seasonNumber: 2 },
        },
        'New season available: Severance',
      ],
      [
        'a movie',
        { type: 'movie', title: 'Dune', username: 'alice' },
        'Movie available: Dune',
      ],
    ] as const)(
      'should title %s with the event and name',
      (_, notification, title) => {
        const embed = createMediaNotificationEmbed(notification)

        expect(embed.title).toBe(title)
        expect(embed.description).toBeUndefined()
      },
    )

    it('should quote the episode title in the episode field', () => {
      const embed = createMediaNotificationEmbed({
        type: 'show',
        title: 'Severance',
        username: 'alice',
        episodeDetails: {
          seasonNumber: 1,
          episodeNumber: 2,
          title: 'Half Loop',
        },
      })

      expect(fieldValue(embed, 'Episode')).toBe('S01E02 "Half Loop"')
    })

    it('should truncate an oversized episode title to the field limit', () => {
      const embed = createMediaNotificationEmbed({
        type: 'show',
        title: 'Severance',
        username: 'alice',
        episodeDetails: {
          seasonNumber: 1,
          episodeNumber: 2,
          title: 'x'.repeat(2000),
        },
      })

      const episode = embed.fields?.find((field) => field.name === 'Episode')
      expect(episode?.value.length).toBe(1024)
      expect(episode?.value.endsWith('...')).toBe(true)
    })

    it('should omit the separator when the episode has no title', () => {
      const embed = createMediaNotificationEmbed({
        type: 'show',
        title: 'Severance',
        username: 'alice',
        episodeDetails: { seasonNumber: 1, episodeNumber: 2 },
      })

      expect(fieldValue(embed, 'Episode')).toBe('S01E02')
    })

    it('should truncate the overview at the field limit', () => {
      const embed = createMediaNotificationEmbed({
        type: 'show',
        title: 'Severance',
        username: 'alice',
        episodeDetails: {
          seasonNumber: 1,
          episodeNumber: 2,
          overview: 'o'.repeat(1200),
        },
      })

      const overview = fieldValue(embed, 'Overview')
      expect(overview).toHaveLength(1024)
      expect(overview?.endsWith('...')).toBe(true)
    })

    it('should leave a short overview untouched', () => {
      const embed = createMediaNotificationEmbed({
        type: 'show',
        title: 'Severance',
        username: 'alice',
        episodeDetails: {
          seasonNumber: 1,
          episodeNumber: 2,
          overview: 'An overview',
        },
      })

      expect(fieldValue(embed, 'Overview')).toBe('An overview')
    })

    it('should include air date and TMDB fields when supplied', () => {
      const embed = createMediaNotificationEmbed({
        type: 'show',
        title: 'Severance',
        username: 'alice',
        tmdbUrl: 'https://www.themoviedb.org/tv/95396',
        episodeDetails: {
          seasonNumber: 1,
          episodeNumber: 2,
          airDateUtc: '2024-01-15T00:00:00Z',
        },
      })

      expect(fieldNames(embed)).toContain('Air date')
      expect(fieldValue(embed, 'More Info')).toBe(
        '[View on TMDB](https://www.themoviedb.org/tv/95396)',
      )
    })

    it('should omit air date and TMDB fields when not supplied', () => {
      const embed = createMediaNotificationEmbed({
        type: 'show',
        title: 'Severance',
        username: 'alice',
        episodeDetails: { seasonNumber: 1, episodeNumber: 2 },
      })

      expect(fieldNames(embed)).not.toContain('Air date')
      expect(fieldNames(embed)).not.toContain('More Info')
    })

    it('should truncate the title at the embed title limit', () => {
      const embed = createMediaNotificationEmbed({
        type: 'movie',
        title: 't'.repeat(300),
        username: 'alice',
      })

      expect(embed.title).toHaveLength(256)
      expect(embed.title?.endsWith('...')).toBe(true)
    })
  })

  describe('createPublicMediaWebhookPayload', () => {
    it('should repeat the title sentence after the mentions', () => {
      const payload = createPublicMediaWebhookPayload(
        { type: 'movie', title: 'Dune', username: 'alice' },
        ['111', '222'],
      )

      expect(payload.content).toBe('<@111> <@222> Movie available: Dune')
      expect(payload.embeds?.[0].title).toBe('Movie available: Dune')
    })

    it('should only let the mentioned users be pinged', () => {
      const payload = createPublicMediaWebhookPayload(
        { type: 'movie', title: '@everyone Dune', username: 'alice' },
        ['111'],
      )

      expect(payload.allowed_mentions).toEqual({ users: ['111'] })
    })

    it('should leave content empty and ping nobody without mentions', () => {
      const payload = createPublicMediaWebhookPayload(
        { type: 'movie', title: 'Dune', username: 'alice' },
        [],
      )

      expect(payload.content).toBe('')
      expect(payload.allowed_mentions).toEqual({ users: [] })
    })
  })

  describe('createApprovalRequestEmbed', () => {
    it('should title the request with the event and content', () => {
      const embed = createApprovalRequestEmbed(
        approvalRequest(),
        1,
        undefined,
        'friend',
      )

      expect(embed.title).toBe('Approval request: Nosferatu')
    })

    it('should name the requester by the given display name', () => {
      const embed = createApprovalRequestEmbed(
        approvalRequest(),
        1,
        undefined,
        'Friendly',
      )

      expect(fieldValue(embed, 'Requested by')).toBe('Friendly')
    })
  })

  describe('createApprovalBatchDm', () => {
    it('should title a single request with the event and content', () => {
      const { embed } = createApprovalBatchDm(
        [approvalRequest()],
        1,
        (request) => request.userName,
      )

      expect(embed.title).toBe('Approval request: Nosferatu')
    })

    it('should name a single requester through the resolver', () => {
      const { embed } = createApprovalBatchDm(
        [approvalRequest()],
        1,
        () => 'Friendly',
      )

      expect(fieldValue(embed, 'Requested by')).toBe('Friendly')
    })

    it('should title a batch with the event and count', () => {
      const { embed } = createApprovalBatchDm(
        [
          approvalRequest(),
          approvalRequest({ id: 2, contentTitle: 'Sherlock' }),
          approvalRequest({ id: 3, contentTitle: 'Dune' }),
        ],
        3,
        (request) => request.userName,
      )

      expect(embed.title).toBe('Approval requests: 3 new')
    })
  })

  describe('createMediaAddedEmbed', () => {
    it('should title the embed with the event and name', () => {
      const embed = createMediaAddedEmbed(
        { type: 'movie', title: 'Dune', username: 'alice' },
        'Alice',
      )

      expect(embed.title).toBe('Watchlist add: Dune')
    })

    it('should label a movie', () => {
      const embed = createMediaAddedEmbed(
        { type: 'movie', title: 'Dune', username: 'alice' },
        'Alice',
      )

      expect(embed.description).toBeUndefined()
      expect(fieldValue(embed, 'Type')).toBe('Movie')
    })

    it('should label a show', () => {
      const embed = createMediaAddedEmbed(
        { type: 'show', title: 'Severance', username: 'alice' },
        'Alice',
      )

      expect(embed.description).toBeUndefined()
      expect(fieldValue(embed, 'Type')).toBe('Show')
    })
  })

  describe('createDeleteSyncEmbed', () => {
    it('should title a live run', () => {
      const embed = createDeleteSyncEmbed(deleteSyncResult(), false)

      expect(embed.title).toBe('Delete sync results')
      expect(embed.color).toBe(0x00ff00)
    })

    it('should title a dry run', () => {
      const embed = createDeleteSyncEmbed(deleteSyncResult(), true)

      expect(embed.title).toBe('Delete sync simulation results')
      expect(embed.description).toBe(
        'This was a dry run, so nothing was deleted.',
      )
      expect(embed.fields?.[0]?.value).toContain('Would delete: ')
      expect(embed.fields?.[0]?.value).not.toContain('Deleted: ')
    })

    it('should title a safety triggered run and colour it red', () => {
      const embed = createDeleteSyncEmbed(
        deleteSyncResult({
          safetyTriggered: true,
          safetyMessage: 'Too many deletions',
        }),
        false,
      )

      expect(embed.title).toBe('Delete sync safety triggered')
      expect(embed.color).toBe(0xff0000)
      expect(fieldValue(embed, 'Safety Reason')).toBe('Too many deletions')
    })

    it('should keep a long safety message out of the description and truncate its field', () => {
      const embed = createDeleteSyncEmbed(
        deleteSyncResult({
          safetyTriggered: true,
          safetyMessage: 'x'.repeat(5000),
          total: { deleted: 0, skipped: 0, processed: 0, protected: 4 },
        }),
        false,
      )

      expect(embed.description).toBe(
        '4 items were preserved because they are in protected playlists.',
      )
      expect(fieldValue(embed, 'Safety Reason')).toHaveLength(1024)
    })

    it('should omit the description when safety triggered with nothing protected', () => {
      const embed = createDeleteSyncEmbed(
        deleteSyncResult({ safetyTriggered: true }),
        false,
      )

      expect(embed.description).toBeUndefined()
      expect(fieldValue(embed, 'Safety Reason')).toBe(
        'A safety check prevented the delete sync operation from running.',
      )
    })

    it('should build the summary field from the totals', () => {
      const embed = createDeleteSyncEmbed(
        deleteSyncResult({
          total: { deleted: 12, skipped: 1, processed: 13, protected: 4 },
        }),
        false,
      )

      expect(fieldValue(embed, 'Summary')).toBe(
        'Processed: 13 items\nDeleted: 12 items\nSkipped: 1 items\nProtected: 4 items',
      )
    })

    it('should append the protected sentence to the description', () => {
      const embed = createDeleteSyncEmbed(
        deleteSyncResult({
          total: { deleted: 0, skipped: 0, processed: 0, protected: 4 },
        }),
        false,
      )

      expect(embed.description).toContain(
        '4 items were preserved because they are in protected playlists.',
      )
    })

    it('should list the first ten movies and continue the rest', () => {
      const embed = createDeleteSyncEmbed(
        deleteSyncResult({
          total: { deleted: 12, skipped: 0, processed: 12 },
          movies: {
            deleted: 12,
            skipped: 0,
            protected: 2,
            items: deletedItems(12, 'Movie'),
          },
        }),
        false,
      )

      const movies = fieldValue(embed, 'Movies (12 deleted, 2 protected)')
      expect(movies?.split('\n')).toHaveLength(10)
      expect(movies).toContain('• Movie 1')
      expect(fieldValue(embed, 'Movies (continued)')).toBe('... and 2 more')
    })

    it('should truncate a long deleted title', () => {
      const embed = createDeleteSyncEmbed(
        deleteSyncResult({
          total: { deleted: 1, skipped: 0, processed: 1 },
          movies: {
            deleted: 1,
            skipped: 0,
            items: [
              {
                title: 'm'.repeat(120),
                guid: 'guid-0',
                instance: 'instance-1',
              },
            ],
          },
        }),
        false,
      )

      expect(fieldValue(embed, 'Movies (1 deleted)')).toBe(
        `• ${'m'.repeat(87)}...`,
      )
    })

    it('should report an empty shows section', () => {
      const embed = createDeleteSyncEmbed(deleteSyncResult(), false)

      expect(fieldValue(embed, 'TV shows')).toBe('No TV shows deleted')
    })

    it('should leave the protected count off an empty section', () => {
      const embed = createDeleteSyncEmbed(
        deleteSyncResult({
          shows: { deleted: 0, skipped: 0, protected: 3, items: [] },
        }),
        false,
      )

      expect(fieldValue(embed, 'TV shows')).toBe('No TV shows deleted')
    })
  })

  describe('createUpdateAvailableEmbed', () => {
    it('should render both versions on plain lines', () => {
      const embed = createUpdateAvailableEmbed({
        currentVersion: '1.0.0',
        latestVersion: '1.1.0',
        releaseUrl: 'https://github.com/jamcalli/Pulsarr/releases/tag/v1.1.0',
        releaseName: 'Big Release',
        releaseBody: 'Release notes',
        publishedAt: '2024-03-01T00:00:00Z',
      })

      expect(embed.description).toContain('**Current:** v1.0.0')
      expect(embed.description).toContain('**Latest:** v1.1.0')
      expect(embed.description).not.toContain('…')
      expect(embed.description).not.toContain('→')
    })

    it('should truncate long release notes with plain dots', () => {
      const embed = createUpdateAvailableEmbed({
        currentVersion: '1.0.0',
        latestVersion: '1.1.0',
        releaseUrl: 'https://github.com/jamcalli/Pulsarr/releases/tag/v1.1.0',
        releaseName: null,
        releaseBody: 'n'.repeat(5000),
        publishedAt: null,
      })

      expect(embed.description).toHaveLength(4096)
      expect(embed.description?.endsWith('...')).toBe(true)
      expect(embed.description).not.toContain('…')
    })
  })

  describe('createSystemDm', () => {
    it('should colour red when the safety flag is set', () => {
      const { embed } = createSystemDm({
        title: 'Delete Sync',
        fields: [],
        safetyTriggered: true,
      })

      expect(embed.color).toBe(0xff0000)
    })

    it('should colour green otherwise', () => {
      const { embed } = createSystemDm({
        title: 'Delete Sync',
        fields: [{ name: 'Summary', value: 'All good' }],
      })

      expect(embed.color).toBe(0x00ff00)
    })

    it('should append the TMDB field', () => {
      const { embed } = createSystemDm({
        title: 'Approval',
        fields: [],
        tmdbUrl: 'https://www.themoviedb.org/movie/438631',
      })

      expect(fieldValue(embed, 'More Info')).toBe(
        '[View on TMDB](https://www.themoviedb.org/movie/438631)',
      )
    })

    it('should add one button row only when a button is given', () => {
      const plain = createSystemDm({ title: 'Approval', fields: [] })
      const withButton = createSystemDm({
        title: 'Approval',
        fields: [],
        button: { label: 'Review Approvals', customId: 'review_approvals_1' },
      })

      expect(plain.components).toBeUndefined()
      expect(withButton.components?.[0].toJSON()).toEqual({
        type: 1,
        components: [
          {
            type: 2,
            custom_id: 'review_approvals_1',
            label: 'Review Approvals',
            style: 1,
          },
        ],
      })
    })
  })

  describe('createWatchlistCapEmbed', () => {
    const event = {
      userId: 3,
      userName: 'plex_user',
      contentType: 'show' as const,
      currentCount: 6,
      cap: 5,
    }

    it('should name the user by the given display name', () => {
      const embed = createWatchlistCapEmbed(event, 'Alex')

      expect(embed.title).toBe('Watchlist cap reached: Alex')
      expect(embed.description).toBe('**Alex** reached their show cap (6/5)')
      expect(fieldValue(embed, 'User')).toBe('Alex')
    })

    it('should name the user in the DM title and User field', () => {
      const { embed } = createWatchlistCapDm(event, 'Alex')

      expect(embed.title).toBe('Watchlist cap reached: Alex')
      expect(fieldValue(embed, 'User')).toBe('Alex')
    })
  })
})
