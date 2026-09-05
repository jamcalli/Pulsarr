import type { DeleteSyncResult } from '@root/types/delete-sync.types.js'
import type { DiscordEmbed } from '@root/types/discord.types.js'
import {
  COLOR_GREEN,
  COLOR_RED,
  createDeleteSyncEmbed,
  createMediaAddedEmbed,
  createMediaNotificationEmbed,
  createSystemEmbed,
  createUpdateAvailableEmbed,
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

describe('discord-embeds', () => {
  describe('createMediaNotificationEmbed', () => {
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

      expect(fieldValue(embed, 'Episode')).toBe('S01E02 - "Half Loop"')
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

      expect(fieldNames(embed)).toContain('Air Date')
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

      expect(fieldNames(embed)).not.toContain('Air Date')
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

  describe('createMediaAddedEmbed', () => {
    it('should label a movie', () => {
      const embed = createMediaAddedEmbed(
        { type: 'movie', title: 'Dune', username: 'alice' },
        'Alice',
      )

      expect(embed.description).toBe('🎬 New Movie Added')
      expect(fieldValue(embed, 'Type')).toBe('Movie')
    })

    it('should label a show', () => {
      const embed = createMediaAddedEmbed(
        { type: 'show', title: 'Severance', username: 'alice' },
        'Alice',
      )

      expect(embed.description).toBe('📺 New Show Added')
      expect(fieldValue(embed, 'Type')).toBe('Show')
    })
  })

  describe('createDeleteSyncEmbed', () => {
    it('should title a live run', () => {
      const embed = createDeleteSyncEmbed(deleteSyncResult(), false)

      expect(embed.title).toBe('🗑️ Delete Sync Results')
      expect(embed.color).toBe(COLOR_GREEN)
    })

    it('should title a dry run', () => {
      const embed = createDeleteSyncEmbed(deleteSyncResult(), true)

      expect(embed.title).toBe('🔍 Delete Sync Simulation Results')
      expect(embed.description).toBe(
        'This was a dry run - no content was actually deleted.',
      )
    })

    it('should title a safety triggered run and colour it red', () => {
      const embed = createDeleteSyncEmbed(
        deleteSyncResult({
          safetyTriggered: true,
          safetyMessage: 'Too many deletions',
        }),
        false,
      )

      expect(embed.title).toBe('⚠️ Delete Sync Safety Triggered')
      expect(embed.color).toBe(COLOR_RED)
      expect(fieldValue(embed, 'Safety Reason')).toBe('Too many deletions')
    })

    it('should truncate a long safety message in the description', () => {
      const embed = createDeleteSyncEmbed(
        deleteSyncResult({
          safetyTriggered: true,
          safetyMessage: 'x'.repeat(5000),
          total: { deleted: 0, skipped: 0, processed: 0, protected: 4 },
        }),
        false,
      )

      expect(embed.description).toHaveLength(4096)
      expect(embed.description?.endsWith('...')).toBe(true)
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

      const movies = fieldValue(embed, 'Movies (12 deleted (2 protected))')
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

      expect(fieldValue(embed, 'TV Shows')).toBe('No TV shows deleted')
    })

    it('should add the protected suffix to an empty section', () => {
      const embed = createDeleteSyncEmbed(
        deleteSyncResult({
          shows: { deleted: 0, skipped: 0, protected: 3, items: [] },
        }),
        false,
      )

      expect(fieldValue(embed, 'TV Shows')).toBe(
        'No TV shows deleted (3 protected)',
      )
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

  describe('createSystemEmbed', () => {
    it('should colour red when a safety reason field is present', () => {
      const embed = createSystemEmbed('Delete Sync', [
        { name: 'Safety Reason', value: 'Too many deletions' },
      ])

      expect(embed.color).toBe(COLOR_RED)
    })

    it('should colour red when the title mentions a safety trigger', () => {
      const embed = createSystemEmbed('Delete Sync Safety Triggered', [])

      expect(embed.color).toBe(COLOR_RED)
    })

    it('should colour red when the safety flag is set', () => {
      const embed = createSystemEmbed('Delete Sync', [], true)

      expect(embed.color).toBe(COLOR_RED)
    })

    it('should colour green otherwise', () => {
      const embed = createSystemEmbed('Delete Sync', [
        { name: 'Summary', value: 'All good' },
      ])

      expect(embed.color).toBe(COLOR_GREEN)
    })

    it('should append the TMDB field without counting it as a safety field', () => {
      const embed = createSystemEmbed(
        'Approval',
        [],
        false,
        'https://www.themoviedb.org/movie/438631',
      )

      expect(fieldValue(embed, 'More Info')).toBe(
        '[View on TMDB](https://www.themoviedb.org/movie/438631)',
      )
      expect(embed.color).toBe(COLOR_GREEN)
    })
  })
})
