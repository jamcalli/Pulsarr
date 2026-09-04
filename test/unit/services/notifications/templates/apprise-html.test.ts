import type { DeleteSyncResult } from '@root/types/delete-sync.types.js'
import type { ApprovalNotification } from '@root/types/discord.types.js'
import {
  createApprovalNotificationHtml,
  createDeleteSyncNotificationHtml,
  createMediaNotificationHtml,
  createTestNotificationHtml,
  createUpdateAvailableNotificationHtml,
  createWatchlistAdditionHtml,
  createWatchlistCapNotificationHtml,
  escapeHtml,
} from '@services/notifications/templates/apprise-html.js'
import { describe, expect, it } from 'vitest'

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

describe('apprise-html', () => {
  describe('escapeHtml', () => {
    it('should escape HTML-significant characters', () => {
      expect(escapeHtml('&')).toBe('&amp;')
      expect(escapeHtml('<')).toBe('&lt;')
      expect(escapeHtml('>')).toBe('&gt;')
      expect(escapeHtml("'")).toBe('&#39;')
      expect(escapeHtml('"')).toBe('&quot;')
      expect(escapeHtml('`')).toBe('&#x60;')
    })

    it('should escape every occurrence in a mixed string', () => {
      expect(escapeHtml('<a href="x">Tom & Jerry</a>')).toBe(
        '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&lt;/a&gt;',
      )
    })

    it('should return empty string for empty input', () => {
      expect(escapeHtml('')).toBe('')
    })

    it('should leave safe characters untouched', () => {
      expect(escapeHtml('Plain title 123')).toBe('Plain title 123')
    })
  })

  describe('createMediaNotificationHtml', () => {
    it('should build a movie notification', () => {
      const result = createMediaNotificationHtml({
        type: 'movie',
        title: 'Dune',
        username: 'alice',
      })

      expect(result.title).toBe('🎬 Dune')
      expect(result.htmlBody).toContain('Dune')
      expect(result.textBody).toBe(
        'Movie Available\n\nDune\nMovie available to watch!',
      )
    })

    it('should append the TMDB link to a movie notification', () => {
      const result = createMediaNotificationHtml({
        type: 'movie',
        title: 'Dune',
        username: 'alice',
        tmdbUrl: 'https://www.themoviedb.org/movie/438631',
      })

      expect(result.textBody).toBe(
        'Movie Available\n\nDune\nMovie available to watch!\nTMDB: https://www.themoviedb.org/movie/438631',
      )
      expect(result.htmlBody).toContain(
        'https://www.themoviedb.org/movie/438631',
      )
    })

    it('should build an episode notification with padded season and episode', () => {
      const result = createMediaNotificationHtml({
        type: 'show',
        title: 'Severance',
        username: 'alice',
        episodeDetails: {
          seasonNumber: 1,
          episodeNumber: 2,
          title: 'Episode Title',
          overview: 'An episode overview',
          airDateUtc: '2024-01-15T00:00:00Z',
        },
      })

      expect(result.title).toBe('📺 Severance')
      expect(result.htmlBody).toContain('S01E02')
      expect(result.htmlBody).toContain('Episode Title')
      expect(result.htmlBody).toContain('An episode overview')
      expect(result.htmlBody).toContain('Air Date')
      expect(result.textBody).toContain('New Episode Available')
      expect(result.textBody).toContain('Episode: S01E02 - "Episode Title"')
      expect(result.textBody).toContain('Overview: An episode overview')
      expect(result.textBody).toContain('Air Date:')
    })

    it('should omit overview and air date when not supplied', () => {
      const result = createMediaNotificationHtml({
        type: 'show',
        title: 'Severance',
        username: 'alice',
        episodeDetails: { seasonNumber: 1, episodeNumber: 2 },
      })

      expect(result.textBody).toBe(
        'New Episode Available\n\nSeverance\nEpisode: S01E02',
      )
      expect(result.htmlBody).not.toContain('Overview')
      expect(result.htmlBody).not.toContain('Air Date')
    })

    it('should build a season notification when only a season is supplied', () => {
      const result = createMediaNotificationHtml({
        type: 'show',
        title: 'Severance',
        username: 'alice',
        episodeDetails: { seasonNumber: 3 },
      })

      expect(result.textBody).toContain('New Season Available')
      expect(result.textBody).toContain('Season Added: Season 3')
      expect(result.htmlBody).toContain('Season 3')
    })

    it('should fall back to generic wording for empty episode details', () => {
      const result = createMediaNotificationHtml({
        type: 'show',
        title: 'Severance',
        username: 'alice',
        episodeDetails: {},
      })

      expect(result.textBody).toBe(
        'New Content Available\n\nSeverance\nNew content is now available to watch!',
      )
      expect(result.htmlBody).toContain(
        'New content is now available to watch!',
      )
    })

    it('should render the poster when a URL is supplied', () => {
      const withPoster = createMediaNotificationHtml({
        type: 'movie',
        title: 'Dune',
        username: 'alice',
        posterUrl: 'https://image.tmdb.org/poster.jpg',
      })
      const withoutPoster = createMediaNotificationHtml({
        type: 'movie',
        title: 'Dune',
        username: 'alice',
      })

      expect(withPoster.htmlBody).toContain('<img')
      expect(withPoster.htmlBody).toContain('https://image.tmdb.org/poster.jpg')
      expect(withoutPoster.htmlBody).not.toContain('<img')
    })

    it('should escape the title in HTML but leave it raw in text', () => {
      const result = createMediaNotificationHtml({
        type: 'movie',
        title: '<script>alert(1)</script>',
        username: 'alice',
      })

      expect(result.htmlBody).toContain('&lt;script&gt;')
      expect(result.htmlBody).not.toContain('<script>')
      expect(result.textBody).toContain('<script>alert(1)</script>')
    })
  })

  describe('createApprovalNotificationHtml', () => {
    const notification: ApprovalNotification = {
      title: 'New Approval Request: Dune',
      contentTitle: 'Dune',
      contentType: 'Movie',
      requestedBy: 'alice',
      reason: 'User quota exceeded',
      totalPending: 3,
      actionRequired: 'Review in the approvals page',
      posterUrl: 'https://image.tmdb.org/approval.jpg',
      tmdbUrl: 'https://www.themoviedb.org/movie/1',
    }

    it('should render every field in both bodies', () => {
      const result = createApprovalNotificationHtml(notification)

      for (const value of [
        'Dune',
        'Movie',
        'alice',
        'User quota exceeded',
        'Review in the approvals page',
      ]) {
        expect(result.htmlBody).toContain(value)
        expect(result.textBody).toContain(value)
      }
      expect(result.htmlBody).toContain('https://www.themoviedb.org/movie/1')
      expect(result.textBody).toContain(
        'TMDB: https://www.themoviedb.org/movie/1',
      )
    })

    it('should relabel the pending count in HTML only', () => {
      const result = createApprovalNotificationHtml(notification)

      expect(result.htmlBody).toContain('3 awaiting review')
      expect(result.htmlBody).not.toContain('3 requests')
      expect(result.textBody).toContain('Total pending: 3 requests')
    })

    it('should render the poster when a URL is supplied', () => {
      const withPoster = createApprovalNotificationHtml(notification)
      const withoutPoster = createApprovalNotificationHtml({
        ...notification,
        posterUrl: undefined,
      })

      expect(withPoster.htmlBody).toContain(
        'https://image.tmdb.org/approval.jpg',
      )
      expect(withoutPoster.htmlBody).not.toContain('<img')
    })
  })

  describe('createUpdateAvailableNotificationHtml', () => {
    const release = {
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      releaseUrl: 'https://github.com/jamcalli/Pulsarr/releases/tag/v1.1.0',
      releaseName: 'Big Release',
      releaseBody: 'Short notes',
      releaseBodyHtml: '<b>Short notes</b>',
      publishedAt: '2024-03-01T00:00:00Z',
    }

    it('should report both versions and the release URL', () => {
      const result = createUpdateAvailableNotificationHtml(release)

      expect(result.title).toBe('🚀 Pulsarr 1.1.0 is available')
      expect(result.htmlBody).toContain('v1.0.0')
      expect(result.htmlBody).toContain('v1.1.0')
      expect(result.htmlBody).toContain(release.releaseUrl)
      expect(result.textBody).toContain('Current: v1.0.0')
      expect(result.textBody).toContain('Latest: v1.1.0')
      expect(result.textBody).toContain(`View release: ${release.releaseUrl}`)
    })

    it('should inject the rendered release notes unescaped', () => {
      const result = createUpdateAvailableNotificationHtml(release)

      expect(result.htmlBody).toContain('<b>Short notes</b>')
    })

    it('should truncate long notes in the text body only', () => {
      const result = createUpdateAvailableNotificationHtml({
        ...release,
        releaseBody: 'x'.repeat(1600),
      })

      expect(result.textBody).toContain(`${'x'.repeat(1500)}...`)
      expect(result.textBody).not.toContain('x'.repeat(1501))
    })

    it('should fall back to the version when the release has no name', () => {
      const result = createUpdateAvailableNotificationHtml({
        ...release,
        releaseName: null,
        releaseBody: null,
        releaseBodyHtml: null,
        publishedAt: null,
      })

      expect(result.htmlBody).toContain('v1.1.0')
      expect(result.textBody).toContain('v1.1.0')
      expect(result.textBody).not.toContain('Published:')
      expect(result.textBody).not.toContain('Release Notes:')
    })
  })

  describe('createWatchlistCapNotificationHtml', () => {
    it('should report movie cap usage in both bodies', () => {
      const result = createWatchlistCapNotificationHtml({
        userName: 'alice',
        contentType: 'movie',
        currentCount: 5,
        cap: 10,
      })

      expect(result.htmlBody).toContain('alice')
      expect(result.htmlBody).toContain('Movie')
      expect(result.htmlBody).toContain('5 / 10')
      expect(result.textBody).toContain('User: alice')
      expect(result.textBody).toContain('Content Type: Movie')
      expect(result.textBody).toContain('Usage: 5 / 10')
    })

    it('should label non-movie content as a show', () => {
      const result = createWatchlistCapNotificationHtml({
        userName: 'bob',
        contentType: 'show',
        currentCount: 1,
        cap: 2,
      })

      expect(result.htmlBody).toContain('Show')
      expect(result.textBody).toContain('Content Type: Show')
    })
  })

  describe('createDeleteSyncNotificationHtml', () => {
    it('should title by mode', () => {
      expect(
        createDeleteSyncNotificationHtml(deleteSyncResult(), true).title,
      ).toBe('🔍 Delete Sync Simulation Results')
      expect(
        createDeleteSyncNotificationHtml(deleteSyncResult(), false).title,
      ).toBe('🗑️ Delete Sync Results')
      expect(
        createDeleteSyncNotificationHtml(
          deleteSyncResult({ safetyTriggered: true }),
          false,
        ).title,
      ).toBe('⚠️ Delete Sync Safety Triggered')
    })

    it('should show the safety message when safety triggered', () => {
      const result = createDeleteSyncNotificationHtml(
        deleteSyncResult({
          safetyTriggered: true,
          safetyMessage: 'Deletion count exceeded the configured maximum',
        }),
        false,
      )

      expect(result.htmlBody).toContain(
        'Deletion count exceeded the configured maximum',
      )
      expect(result.textBody).toContain(
        'Safety Reason: Deletion count exceeded the configured maximum',
      )
    })

    it('should cap the deleted list at ten and count the remainder', () => {
      const result = createDeleteSyncNotificationHtml(
        deleteSyncResult({
          total: { deleted: 12, skipped: 0, processed: 12 },
          movies: {
            deleted: 12,
            skipped: 0,
            items: deletedItems(12, 'Movie'),
          },
        }),
        false,
      )

      expect(result.htmlBody).toContain('Movie 10')
      expect(result.htmlBody).not.toContain('Movie 11')
      expect(result.htmlBody).toContain('... and 2 more movies')
      expect(result.textBody).toContain('• Movie 10')
      expect(result.textBody).not.toContain('• Movie 11')
      expect(result.textBody).toContain('... and 2 more movies')
    })

    it('should report an empty section', () => {
      const result = createDeleteSyncNotificationHtml(
        deleteSyncResult({
          shows: { deleted: 0, skipped: 0, items: [] },
        }),
        false,
      )

      expect(result.htmlBody).toContain('No TV shows deleted')
      expect(result.textBody).toContain('TV Shows: No TV shows deleted')
    })

    it('should report protected counts when present', () => {
      const result = createDeleteSyncNotificationHtml(
        deleteSyncResult({
          total: { deleted: 0, skipped: 0, processed: 4, protected: 4 },
          movies: { deleted: 0, skipped: 0, protected: 3, items: [] },
        }),
        false,
      )

      expect(result.htmlBody).toContain('(3 protected)')
      expect(result.textBody).toContain('Protected: 4 items')
      expect(result.textBody).toContain('No movies deleted (3 protected)')
      expect(result.textBody).toContain(
        '4 items were preserved because they are in protected playlists.',
      )
    })
  })

  describe('createWatchlistAdditionHtml', () => {
    const base = {
      title: 'Dune',
      addedBy: { name: 'alice' },
      displayName: 'Alice A',
    }

    it('should title movies with the film emoji', () => {
      expect(
        createWatchlistAdditionHtml({ ...base, type: 'movie' }).title,
      ).toBe('🎬 Movie Added: Dune')
    })

    it('should title every show alias with the TV emoji', () => {
      for (const type of ['show', 'tv', 'series']) {
        expect(createWatchlistAdditionHtml({ ...base, type }).title).toBe(
          '📺 Show Added: Dune',
        )
      }
    })

    it('should label an unknown type as media', () => {
      expect(createWatchlistAdditionHtml({ ...base, type: 'book' }).title).toBe(
        '🎬 Media Added: Dune',
      )
    })

    it('should name the adding user in both bodies', () => {
      const result = createWatchlistAdditionHtml({ ...base, type: 'movie' })

      expect(result.htmlBody).toContain('Alice A')
      expect(result.textBody).toContain('Added by: Alice A')
    })

    it('should render the poster and TMDB link when supplied', () => {
      const withExtras = createWatchlistAdditionHtml({
        ...base,
        type: 'movie',
        posterUrl: 'https://image.tmdb.org/dune.jpg',
        tmdbUrl: 'https://www.themoviedb.org/movie/438631',
      })
      const withoutExtras = createWatchlistAdditionHtml({
        ...base,
        type: 'movie',
      })

      expect(withExtras.htmlBody).toContain('https://image.tmdb.org/dune.jpg')
      expect(withExtras.htmlBody).toContain(
        'https://www.themoviedb.org/movie/438631',
      )
      expect(withExtras.textBody).toContain(
        'TMDB: https://www.themoviedb.org/movie/438631',
      )
      expect(withoutExtras.htmlBody).not.toContain('<img')
      expect(withoutExtras.textBody).not.toContain('TMDB:')
    })
  })

  describe('createTestNotificationHtml', () => {
    it('should return the fixed title and formatted HTML', () => {
      const result = createTestNotificationHtml()

      expect(result.title).toBe('🔔 Pulsarr HTML Notification Test')
      expect(result.htmlBody).toContain('<strong>')
      expect(result.textBody).toContain('Pulsarr HTML Notification Test')
    })
  })

  describe('every template', () => {
    const outputs = [
      createMediaNotificationHtml({
        type: 'movie',
        title: 'Dune',
        username: 'alice',
        posterUrl: 'https://image.tmdb.org/dune.jpg',
        tmdbUrl: 'https://www.themoviedb.org/movie/438631',
      }),
      createApprovalNotificationHtml({
        title: 'New Approval Request: Dune',
        contentTitle: 'Dune',
        contentType: 'Movie',
        requestedBy: 'alice',
        reason: 'User quota exceeded',
        totalPending: 1,
        actionRequired: 'Review in the approvals page',
      }),
      createUpdateAvailableNotificationHtml({
        currentVersion: '1.0.0',
        latestVersion: '1.1.0',
        releaseUrl: 'https://github.com/jamcalli/Pulsarr/releases/tag/v1.1.0',
        releaseName: 'Big Release',
        releaseBody: 'Short notes',
        releaseBodyHtml: '<b>Short notes</b>',
        publishedAt: '2024-03-01T00:00:00Z',
      }),
      createWatchlistCapNotificationHtml({
        userName: 'alice',
        contentType: 'movie',
        currentCount: 5,
        cap: 10,
      }),
      createDeleteSyncNotificationHtml(
        deleteSyncResult({
          total: { deleted: 1, skipped: 0, processed: 1 },
          movies: { deleted: 1, skipped: 0, items: deletedItems(1, 'Movie') },
        }),
        false,
      ),
      createWatchlistAdditionHtml({
        title: 'Dune',
        type: 'movie',
        addedBy: { name: 'alice' },
        displayName: 'Alice A',
      }),
      createTestNotificationHtml(),
    ]

    it('should carry no branding sign-off or arrow glyph', () => {
      for (const output of outputs) {
        for (const body of [output.htmlBody, output.textBody]) {
          expect(body).not.toContain('Powered by')
          expect(body).not.toContain('- Pulsarr')
          expect(body).not.toContain('\u2192')
        }
      }
    })

    it('should wrap HTML bodies and keep text bodies free of markup', () => {
      for (const output of outputs) {
        expect(output.htmlBody).toContain('<div')
        expect(output.textBody).not.toContain('<')
      }
    })
  })
})
