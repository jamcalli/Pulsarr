import type { DeleteSyncResult } from '@root/types/delete-sync.types.js'
import type { ApprovalNotification } from '@root/types/notification.types.js'
import {
  createApprovalAppriseMessage,
  createDeleteSyncAppriseMessage,
  createMediaAppriseMessage,
  createTestAppriseMessage,
  createUpdateAvailableAppriseMessage,
  createWatchlistAddedAppriseMessage,
  createWatchlistCapAppriseMessage,
  escapeHtml,
} from '@services/notifications/templates/apprise-html.js'
import { TEST_NOTIFICATION } from '@services/notifications/templates/labels.js'
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

  describe('createMediaAppriseMessage', () => {
    it('should build a movie notification', () => {
      const result = createMediaAppriseMessage({
        type: 'movie',
        title: 'Dune',
        username: 'alice',
      })

      expect(result.title).toBe('🎬 Dune')
      expect(result.bodyHtml).toContain('Dune')
      expect(result.body).toBe(
        'Movie Available\n\nDune\nMovie available to watch!',
      )
    })

    it('should append the TMDB link to a movie notification', () => {
      const result = createMediaAppriseMessage({
        type: 'movie',
        title: 'Dune',
        username: 'alice',
        tmdbUrl: 'https://www.themoviedb.org/movie/438631',
      })

      expect(result.body).toBe(
        'Movie Available\n\nDune\nMovie available to watch!\nTMDB: https://www.themoviedb.org/movie/438631',
      )
      expect(result.bodyHtml).toContain(
        'https://www.themoviedb.org/movie/438631',
      )
    })

    it('should build an episode notification with padded season and episode', () => {
      const result = createMediaAppriseMessage({
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
      expect(result.bodyHtml).toContain('S01E02')
      expect(result.bodyHtml).toContain('Episode Title')
      expect(result.bodyHtml).toContain('An episode overview')
      expect(result.bodyHtml).toContain('Air Date')
      expect(result.body).toContain('New Episode Available')
      expect(result.body).toContain('Episode: S01E02 - "Episode Title"')
      expect(result.body).toContain('Overview: An episode overview')
      expect(result.body).toContain('Air Date:')
    })

    it('should omit overview and air date when not supplied', () => {
      const result = createMediaAppriseMessage({
        type: 'show',
        title: 'Severance',
        username: 'alice',
        episodeDetails: { seasonNumber: 1, episodeNumber: 2 },
      })

      expect(result.body).toBe(
        'New Episode Available\n\nSeverance\nEpisode: S01E02',
      )
      expect(result.bodyHtml).not.toContain('Overview')
      expect(result.bodyHtml).not.toContain('Air Date')
    })

    it('should build a season notification when only a season is supplied', () => {
      const result = createMediaAppriseMessage({
        type: 'show',
        title: 'Severance',
        username: 'alice',
        episodeDetails: { seasonNumber: 3 },
      })

      expect(result.body).toContain('New Season Available')
      expect(result.body).toContain('Season Added: Season 3')
      expect(result.bodyHtml).toContain('Season 3')
    })

    it('should fall back to generic wording for empty episode details', () => {
      const result = createMediaAppriseMessage({
        type: 'show',
        title: 'Severance',
        username: 'alice',
        episodeDetails: {},
      })

      expect(result.body).toBe(
        'New Content Available\n\nSeverance\nNew content is now available to watch!',
      )
      expect(result.bodyHtml).toContain(
        'New content is now available to watch!',
      )
    })

    it('should render the poster when a URL is supplied', () => {
      const withPoster = createMediaAppriseMessage({
        type: 'movie',
        title: 'Dune',
        username: 'alice',
        posterUrl: 'https://image.tmdb.org/poster.jpg',
      })
      const withoutPoster = createMediaAppriseMessage({
        type: 'movie',
        title: 'Dune',
        username: 'alice',
      })

      expect(withPoster.bodyHtml).toContain('<img')
      expect(withPoster.bodyHtml).toContain('https://image.tmdb.org/poster.jpg')
      expect(withoutPoster.bodyHtml).not.toContain('<img')
    })

    it('should escape the poster URL inside the src attribute', () => {
      const result = createMediaAppriseMessage({
        type: 'movie',
        title: 'Dune',
        username: 'alice',
        posterUrl: 'https://plex.example/poster.jpg" onerror="alert(1)',
      })

      expect(result.bodyHtml).toContain(
        'src="https://plex.example/poster.jpg&quot; onerror=&quot;alert(1)"',
      )
      expect(result.bodyHtml).not.toContain('" onerror="')
    })

    it('should escape the title in HTML but leave it raw in text', () => {
      const result = createMediaAppriseMessage({
        type: 'movie',
        title: '<script>alert(1)</script>',
        username: 'alice',
      })

      expect(result.bodyHtml).toContain('&lt;script&gt;')
      expect(result.bodyHtml).not.toContain('<script>')
      expect(result.body).toContain('<script>alert(1)</script>')
    })
  })

  describe('createApprovalAppriseMessage', () => {
    const notification: ApprovalNotification = {
      contentTitle: 'Dune',
      contentType: 'movie',
      requestedBy: 'alice',
      reason: 'User quota exceeded',
      totalPending: 3,
      posterUrl: 'https://image.tmdb.org/approval.jpg',
      tmdbUrl: 'https://www.themoviedb.org/movie/1',
    }

    it('should render every field in both bodies', () => {
      const result = createApprovalAppriseMessage(notification)

      for (const value of [
        'Dune',
        'Movie',
        'alice',
        'User quota exceeded',
        'Visit the Pulsarr UI',
      ]) {
        expect(result.bodyHtml).toContain(value)
        expect(result.body).toContain(value)
      }
      expect(result.bodyHtml).toContain('https://www.themoviedb.org/movie/1')
      expect(result.body).toContain('TMDB: https://www.themoviedb.org/movie/1')
    })

    it('should relabel the pending count in HTML only', () => {
      const result = createApprovalAppriseMessage(notification)

      expect(result.bodyHtml).toContain('3 awaiting review')
      expect(result.bodyHtml).not.toContain('3 requests')
      expect(result.body).toContain('Total pending: 3 requests')
    })

    it('should render the poster when a URL is supplied', () => {
      const withPoster = createApprovalAppriseMessage(notification)
      const withoutPoster = createApprovalAppriseMessage({
        ...notification,
        posterUrl: undefined,
      })

      expect(withPoster.bodyHtml).toContain(
        'https://image.tmdb.org/approval.jpg',
      )
      expect(withoutPoster.bodyHtml).not.toContain('<img')
    })
  })

  describe('createUpdateAvailableAppriseMessage', () => {
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
      const result = createUpdateAvailableAppriseMessage(release)

      expect(result.title).toBe('🚀 Pulsarr 1.1.0 is available')
      expect(result.bodyHtml).toContain('v1.0.0')
      expect(result.bodyHtml).toContain('v1.1.0')
      expect(result.bodyHtml).toContain(release.releaseUrl)
      expect(result.body).toContain('Current: v1.0.0')
      expect(result.body).toContain('Latest: v1.1.0')
      expect(result.body).toContain(`View release: ${release.releaseUrl}`)
    })

    it('should inject the rendered release notes unescaped', () => {
      const result = createUpdateAvailableAppriseMessage(release)

      expect(result.bodyHtml).toContain('<b>Short notes</b>')
    })

    it('should truncate long notes in the text body only', () => {
      const result = createUpdateAvailableAppriseMessage({
        ...release,
        releaseBody: 'x'.repeat(1600),
      })

      expect(result.body).toContain(`${'x'.repeat(1500)}...`)
      expect(result.body).not.toContain('x'.repeat(1501))
    })

    it('should fall back to the version when the release has no name', () => {
      const result = createUpdateAvailableAppriseMessage({
        ...release,
        releaseName: null,
        releaseBody: null,
        releaseBodyHtml: null,
        publishedAt: null,
      })

      expect(result.bodyHtml).toContain('v1.1.0')
      expect(result.body).toContain('v1.1.0')
      expect(result.body).not.toContain('Published:')
      expect(result.body).not.toContain('Release Notes:')
    })
  })

  describe('createWatchlistCapAppriseMessage', () => {
    it('should report movie cap usage in both bodies', () => {
      const result = createWatchlistCapAppriseMessage(
        {
          userId: 1,
          userName: 'alice',
          contentType: 'movie',
          currentCount: 5,
          cap: 10,
        },
        'alice',
      )

      expect(result.bodyHtml).toContain('alice')
      expect(result.bodyHtml).toContain('Movie')
      expect(result.bodyHtml).toContain('5 / 10')
      expect(result.body).toContain('User: alice')
      expect(result.body).toContain('Content Type: Movie')
      expect(result.body).toContain('Usage: 5 / 10')
    })

    it('should label non-movie content as a show', () => {
      const result = createWatchlistCapAppriseMessage(
        {
          userId: 1,
          userName: 'bob',
          contentType: 'show',
          currentCount: 1,
          cap: 2,
        },
        'bob',
      )

      expect(result.bodyHtml).toContain('Show')
      expect(result.body).toContain('Content Type: Show')
    })
  })

  describe('createDeleteSyncAppriseMessage', () => {
    it('should title by mode', () => {
      expect(
        createDeleteSyncAppriseMessage(deleteSyncResult(), true).title,
      ).toBe('🔍 Delete Sync Simulation Results')
      expect(
        createDeleteSyncAppriseMessage(deleteSyncResult(), false).title,
      ).toBe('🗑️ Delete Sync Results')
      expect(
        createDeleteSyncAppriseMessage(
          deleteSyncResult({ safetyTriggered: true }),
          false,
        ).title,
      ).toBe('⚠️ Delete Sync Safety Triggered')
    })

    it('should show the safety message when safety triggered', () => {
      const result = createDeleteSyncAppriseMessage(
        deleteSyncResult({
          safetyTriggered: true,
          safetyMessage: 'Deletion count exceeded the configured maximum',
        }),
        false,
      )

      expect(result.bodyHtml).toContain(
        'Deletion count exceeded the configured maximum',
      )
      expect(result.body).toContain(
        'Safety Reason: Deletion count exceeded the configured maximum',
      )
    })

    it('should cap the deleted list at ten and count the remainder', () => {
      const result = createDeleteSyncAppriseMessage(
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

      expect(result.bodyHtml).toContain('Movie 10')
      expect(result.bodyHtml).not.toContain('Movie 11')
      expect(result.bodyHtml).toContain('... and 2 more movies')
      expect(result.body).toContain('• Movie 10')
      expect(result.body).not.toContain('• Movie 11')
      expect(result.body).toContain('... and 2 more movies')
    })

    it('should report an empty section', () => {
      const result = createDeleteSyncAppriseMessage(
        deleteSyncResult({
          shows: { deleted: 0, skipped: 0, items: [] },
        }),
        false,
      )

      expect(result.bodyHtml).toContain('No TV shows deleted')
      expect(result.body).toContain('TV Shows: No TV shows deleted')
    })

    it('should report protected counts when present', () => {
      const result = createDeleteSyncAppriseMessage(
        deleteSyncResult({
          total: { deleted: 0, skipped: 0, processed: 4, protected: 4 },
          movies: { deleted: 0, skipped: 0, protected: 3, items: [] },
        }),
        false,
      )

      expect(result.bodyHtml).toContain('(3 protected)')
      expect(result.body).toContain('Protected: 4 items')
      expect(result.body).toContain('No movies deleted (3 protected)')
      expect(result.body).toContain(
        '4 items were preserved because they are in protected playlists.',
      )
    })
  })

  describe('createWatchlistAddedAppriseMessage', () => {
    const base = { title: 'Dune', username: 'alice' }

    it('should title movies with the film emoji', () => {
      expect(
        createWatchlistAddedAppriseMessage(
          { ...base, type: 'movie' },
          'Alice A',
        ).title,
      ).toBe('🎬 Movie Added: Dune')
    })

    it('should title shows with the TV emoji', () => {
      expect(
        createWatchlistAddedAppriseMessage({ ...base, type: 'show' }, 'Alice A')
          .title,
      ).toBe('📺 Show Added: Dune')
    })

    it('should name the adding user in both bodies', () => {
      const result = createWatchlistAddedAppriseMessage(
        { ...base, type: 'movie' },
        'Alice A',
      )

      expect(result.bodyHtml).toContain('Alice A')
      expect(result.body).toContain('Added by: Alice A')
    })

    it('should render the poster and TMDB link when supplied', () => {
      const withExtras = createWatchlistAddedAppriseMessage(
        {
          ...base,
          type: 'movie',
          posterUrl: 'https://image.tmdb.org/dune.jpg',
          tmdbUrl: 'https://www.themoviedb.org/movie/438631',
        },
        'Alice A',
      )
      const withoutExtras = createWatchlistAddedAppriseMessage(
        { ...base, type: 'movie' },
        'Alice A',
      )

      expect(withExtras.bodyHtml).toContain('https://image.tmdb.org/dune.jpg')
      expect(withExtras.bodyHtml).toContain(
        'https://www.themoviedb.org/movie/438631',
      )
      expect(withExtras.body).toContain(
        'TMDB: https://www.themoviedb.org/movie/438631',
      )
      expect(withoutExtras.bodyHtml).not.toContain('<img')
      expect(withoutExtras.body).not.toContain('TMDB:')
    })
  })

  describe('createTestAppriseMessage', () => {
    it('should render the shared test copy in both bodies', () => {
      const result = createTestAppriseMessage()

      expect(result.title).toBe(TEST_NOTIFICATION.title)
      expect(result.bodyHtml).toContain(TEST_NOTIFICATION.body)
      expect(result.body).toContain(TEST_NOTIFICATION.body)
    })
  })

  describe('every template', () => {
    const outputs = [
      createMediaAppriseMessage({
        type: 'movie',
        title: 'Dune',
        username: 'alice',
        posterUrl: 'https://image.tmdb.org/dune.jpg',
        tmdbUrl: 'https://www.themoviedb.org/movie/438631',
      }),
      createApprovalAppriseMessage({
        contentTitle: 'Dune',
        contentType: 'movie',
        requestedBy: 'alice',
        reason: 'User quota exceeded',
        totalPending: 1,
      }),
      createUpdateAvailableAppriseMessage({
        currentVersion: '1.0.0',
        latestVersion: '1.1.0',
        releaseUrl: 'https://github.com/jamcalli/Pulsarr/releases/tag/v1.1.0',
        releaseName: 'Big Release',
        releaseBody: 'Short notes',
        releaseBodyHtml: '<b>Short notes</b>',
        publishedAt: '2024-03-01T00:00:00Z',
      }),
      createWatchlistCapAppriseMessage(
        {
          userId: 1,
          userName: 'alice',
          contentType: 'movie',
          currentCount: 5,
          cap: 10,
        },
        'alice',
      ),
      createDeleteSyncAppriseMessage(
        deleteSyncResult({
          total: { deleted: 1, skipped: 0, processed: 1 },
          movies: { deleted: 1, skipped: 0, items: deletedItems(1, 'Movie') },
        }),
        false,
      ),
      createWatchlistAddedAppriseMessage(
        { title: 'Dune', type: 'movie', username: 'alice' },
        'Alice A',
      ),
      createTestAppriseMessage(),
    ]

    it('should carry no branding sign-off or arrow glyph', () => {
      for (const output of outputs) {
        for (const body of [output.bodyHtml, output.body]) {
          expect(body).not.toContain('Powered by')
          expect(body).not.toContain('- Pulsarr')
          expect(body).not.toContain('\u2192')
        }
      }
    })

    it('should wrap HTML bodies and keep text bodies free of markup', () => {
      for (const output of outputs) {
        expect(output.bodyHtml).toContain('<div')
        expect(output.body).not.toContain('<')
      }
    })
  })
})
