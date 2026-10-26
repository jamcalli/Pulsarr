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

      expect(result.title).toBe('Movie available: Dune')
      expect(result.bodyHtml).toContain('Movie available</td>')
      expect(result.bodyHtml).toContain('>Dune</h1>')
      expect(result.bodyHtml).toContain('Movie available to watch!')
      expect(result.bodyHtml).not.toContain('View on TMDB')
      expect(result.body).toBe(
        'Movie available\n\nDune\nMovie available to watch!',
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
        'Movie available\n\nDune\nMovie available to watch!\nTMDB: https://www.themoviedb.org/movie/438631',
      )
      expect(result.bodyHtml).toContain(
        'href="https://www.themoviedb.org/movie/438631"',
      )
      expect(result.bodyHtml).toContain('View on TMDB</a>')
    })

    it('should build an episode notification as fact rows', () => {
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

      expect(result.title).toBe('New episode available: Severance')
      expect(result.bodyHtml).toContain('New episode available</td>')
      expect(result.bodyHtml).toContain('>Severance</h1>')
      expect(result.bodyHtml).toContain('>Episode</td>')
      expect(result.bodyHtml).toContain('S01E02 &quot;Episode Title&quot;')
      expect(result.bodyHtml).toContain('>Overview</td>')
      expect(result.bodyHtml).toContain('An episode overview')
      expect(result.bodyHtml).toContain('>Air date</td>')
      expect(result.body).toContain('New episode available')
      expect(result.body).toContain('Episode: S01E02 "Episode Title"')
      expect(result.body).toContain('Overview: An episode overview')
      expect(result.body).toContain('Air date:')
    })

    it('should omit overview and air date when not supplied', () => {
      const result = createMediaAppriseMessage({
        type: 'show',
        title: 'Severance',
        username: 'alice',
        episodeDetails: { seasonNumber: 1, episodeNumber: 2 },
      })

      expect(result.body).toBe(
        'New episode available\n\nSeverance\nEpisode: S01E02',
      )
      expect(result.bodyHtml).not.toContain('Overview')
      expect(result.bodyHtml).not.toContain('Air date')
    })

    it('should build a season notification when only a season is supplied', () => {
      const result = createMediaAppriseMessage({
        type: 'show',
        title: 'Severance',
        username: 'alice',
        episodeDetails: { seasonNumber: 3 },
      })

      expect(result.bodyHtml).toContain('New season available</td>')
      expect(result.bodyHtml).toContain('>Season added</td>')
      expect(result.bodyHtml).toContain('Season 3')
      expect(result.body).toContain('New season available')
      expect(result.body).toContain('Season added: Season 3')
    })

    it('should fall back to generic wording for empty episode details', () => {
      const result = createMediaAppriseMessage({
        type: 'show',
        title: 'Severance',
        username: 'alice',
        episodeDetails: {},
      })

      expect(result.body).toBe(
        'New content available\n\nSeverance\nNew content is now available to watch!',
      )
      expect(result.bodyHtml).toContain('New content available</td>')
      expect(result.bodyHtml).toContain(
        'New content is now available to watch!',
      )
    })

    it('should render the poster cell only when a URL is supplied', () => {
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
      expect(withPoster.bodyHtml).toContain('alt="Dune poster"')
      expect(withPoster.bodyHtml).toContain('width="120" height="180"')
      expect(withoutPoster.bodyHtml).not.toContain('<img')
      expect(withoutPoster.bodyHtml).not.toContain('width="120"')
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
      trigger: 'quota_exceeded',
      reason: 'Weekly movie limit of 5 reached',
      totalPending: 3,
      posterUrl: 'https://image.tmdb.org/approval.jpg',
      tmdbUrl: 'https://www.themoviedb.org/movie/1',
    }

    it('should render the band, pill, title and every row', () => {
      const { bodyHtml } = createApprovalAppriseMessage(notification)

      expect(bodyHtml).toContain('Approval request</td>')
      expect(bodyHtml).toContain('Pending approval</span>')
      expect(bodyHtml).toContain('>Dune</h1>')
      for (const [label, value] of [
        ['Type', 'Movie'],
        ['Requested by', 'alice'],
        ['Pending requests', '3 awaiting review'],
        ['Reason', 'Quota exceeded'],
      ]) {
        expect(bodyHtml).toContain(`>${label}</td>`)
        expect(bodyHtml).toContain(`>${value}`)
      }
      expect(bodyHtml).toContain('width:136px')
      expect(bodyHtml).toContain('Visit the Pulsarr UI')
      expect(bodyHtml).toContain('href="https://www.themoviedb.org/movie/1"')
    })

    it('should mute the reason text under the trigger label', () => {
      const { bodyHtml } = createApprovalAppriseMessage(notification)

      expect(bodyHtml).toContain(
        'Quota exceeded<div style="font-weight:400;color:#5a5750;">Weekly movie limit of 5 reached</div>',
      )
    })

    it('should drop the muted line without a reason', () => {
      const { bodyHtml } = createApprovalAppriseMessage({
        ...notification,
        trigger: 'manual_flag',
        reason: null,
      })

      expect(bodyHtml).toContain('Manual flag</td>')
    })

    it('should keep the text body on its existing lines', () => {
      const { body } = createApprovalAppriseMessage(notification)

      expect(body).toContain('Approval request')
      expect(body).toContain('Type: Movie')
      expect(body).toContain('Requested by: alice')
      expect(body).toContain('Total pending: 3 requests')
      expect(body).toContain(
        'Reason: Quota exceeded\nWeekly movie limit of 5 reached',
      )
      expect(body).toContain('TMDB: https://www.themoviedb.org/movie/1')
      expect(body).toContain('Visit the Pulsarr UI')
    })

    it('should render the poster cell only when a URL is supplied', () => {
      const withPoster = createApprovalAppriseMessage(notification)
      const withoutPoster = createApprovalAppriseMessage({
        ...notification,
        posterUrl: undefined,
      })

      expect(withPoster.bodyHtml).toContain(
        'src="https://image.tmdb.org/approval.jpg"',
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

    it('should render the band, title, rows and release link', () => {
      const result = createUpdateAvailableAppriseMessage(release)

      expect(result.title).toBe('Update available: Pulsarr 1.1.0')
      expect(result.bodyHtml).toContain('Update available</td>')
      expect(result.bodyHtml).toContain('>Big Release</h1>')
      expect(result.bodyHtml).toContain('>Current</td>')
      expect(result.bodyHtml).toContain('>v1.0.0')
      expect(result.bodyHtml).toContain('>Latest</td>')
      expect(result.bodyHtml).toContain('>v1.1.0')
      expect(result.bodyHtml).toContain('>Published</td>')
      expect(result.bodyHtml).toContain(`href="${release.releaseUrl}"`)
      expect(result.bodyHtml).toContain('View release on GitHub</a>')
      expect(result.body).toContain('Current: v1.0.0')
      expect(result.body).toContain('Latest: v1.1.0')
      expect(result.body).toContain(`View release: ${release.releaseUrl}`)
    })

    it('should inject the rendered release notes unescaped', () => {
      const result = createUpdateAvailableAppriseMessage(release)

      expect(result.bodyHtml).toContain('Release notes</h2>')
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

      expect(result.bodyHtml).toContain('>v1.1.0</h1>')
      expect(result.bodyHtml).not.toContain('Published')
      expect(result.bodyHtml).not.toContain('Release notes')
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

      expect(result.title).toBe('Watchlist cap reached: alice')
      expect(result.bodyHtml).toContain('Watchlist cap</td>')
      expect(result.bodyHtml).toContain('>Watchlist cap reached</h1>')
      for (const [label, value] of [
        ['User', 'alice'],
        ['Content type', 'Movie'],
        ['Usage', '5 / 10'],
      ]) {
        expect(result.bodyHtml).toContain(`>${label}</td>`)
        expect(result.bodyHtml).toContain(`>${value}</td>`)
      }
      expect(result.bodyHtml).toContain(
        'New items wait until the cap is raised or items are removed.',
      )
      expect(result.body).toContain('User: alice')
      expect(result.body).toContain('Content Type: Movie')
      expect(result.body).toContain('Usage: 5 / 10')
      expect(result.body).toContain(
        'New items wait until the cap is raised or items are removed.',
      )
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

      expect(result.bodyHtml).toContain('>Show</td>')
      expect(result.body).toContain('Content Type: Show')
    })
  })

  describe('createDeleteSyncAppriseMessage', () => {
    it('should title by mode', () => {
      expect(
        createDeleteSyncAppriseMessage(deleteSyncResult(), true).title,
      ).toBe('Delete sync simulation results')
      expect(
        createDeleteSyncAppriseMessage(deleteSyncResult(), false).title,
      ).toBe('Delete sync results')
      expect(
        createDeleteSyncAppriseMessage(
          deleteSyncResult({ safetyTriggered: true }),
          false,
        ).title,
      ).toBe('Delete sync safety triggered')
    })

    it('should render a live run with stats, lists and the completion line', () => {
      const { bodyHtml, body } = createDeleteSyncAppriseMessage(
        deleteSyncResult({
          total: { deleted: 12, skipped: 202, processed: 214, protected: 3 },
          movies: {
            deleted: 11,
            skipped: 0,
            protected: 2,
            items: deletedItems(11, 'Movie'),
          },
          shows: {
            deleted: 1,
            skipped: 0,
            protected: 1,
            items: deletedItems(1, 'Show'),
          },
        }),
        false,
      )

      expect(bodyHtml).toContain('Delete sync</td>')
      expect(bodyHtml).toContain('>Delete sync results</h1>')
      expect(bodyHtml).not.toContain('Dry run')
      expect(bodyHtml).toContain(
        'Removed because no user has them on a watchlist anymore.',
      )
      expect(bodyHtml).toContain(
        '3 items were preserved because they are in protected playlists.',
      )
      for (const label of ['Processed', 'Deleted', 'Skipped', 'Protected']) {
        expect(bodyHtml).toContain(`>${label}</div>`)
      }
      expect(bodyHtml).not.toContain('Would delete')
      expect(bodyHtml).toContain(
        'Movies<span style="font-weight:400;color:#5a5750;">, 11 deleted, 2 protected</span>',
      )
      expect(bodyHtml).toContain(
        'TV shows<span style="font-weight:400;color:#5a5750;">, 1 deleted, 1 protected</span>',
      )
      expect(bodyHtml).toContain('+1 more movie<')
      expect(bodyHtml).toContain('Completed at ')
      expect(bodyHtml).not.toContain('Safety reason')
      expect(body).toContain('Movies (11 deleted, 2 protected):')
      expect(body).toContain('+1 more movie\n')
      expect(body).toContain('Deleted: 12 items')
    })

    it('should mark a dry run with the pill and would-delete labels', () => {
      const { bodyHtml, body } = createDeleteSyncAppriseMessage(
        deleteSyncResult({
          total: { deleted: 2, skipped: 0, processed: 2 },
          movies: { deleted: 2, skipped: 0, items: deletedItems(2, 'Movie') },
        }),
        true,
      )

      expect(bodyHtml).toContain('>Delete sync simulation results</h1>')
      expect(bodyHtml).toContain('Dry run</span>')
      expect(bodyHtml).toContain('This was a dry run, so nothing was deleted.')
      expect(bodyHtml).toContain('>Would delete</div>')
      expect(bodyHtml).not.toContain('>Deleted</div>')
      expect(bodyHtml).not.toContain('>Protected</div>')
      expect(bodyHtml).toContain(', 2 would be deleted</span>')
      expect(body).toContain('Would delete: 2 items')
      expect(body).toContain('Movies (2 would be deleted):')
    })

    it('should show the safety message once, in the alert', () => {
      const message = 'Deletion count exceeded the configured maximum'
      const result = createDeleteSyncAppriseMessage(
        deleteSyncResult({ safetyTriggered: true, safetyMessage: message }),
        false,
      )

      expect(result.bodyHtml).toContain('>Delete sync safety triggered</h1>')
      expect(result.bodyHtml).toContain('Stopped</span>')
      expect(result.bodyHtml).toContain('Safety reason</div>')
      expect(result.bodyHtml.split(message)).toHaveLength(2)
      expect(result.body.split(message)).toHaveLength(2)
      expect(result.body).toContain(`Safety Reason: ${message}`)
      expect(result.body.startsWith('Summary:')).toBe(true)
    })

    it('should fall back to the generic safety sentence', () => {
      const result = createDeleteSyncAppriseMessage(
        deleteSyncResult({ safetyTriggered: true }),
        false,
      )

      expect(result.bodyHtml).toContain(
        'A safety check prevented the delete sync operation from running.',
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
      expect(result.bodyHtml).toContain('+2 more movies')
      expect(result.body).toContain('• Movie 10')
      expect(result.body).not.toContain('• Movie 11')
      expect(result.body).toContain('+2 more movies')
    })

    it('should report empty sections', () => {
      const result = createDeleteSyncAppriseMessage(deleteSyncResult(), false)

      expect(result.bodyHtml).toContain('No movies deleted')
      expect(result.bodyHtml).toContain('No TV shows deleted')
      expect(result.bodyHtml).not.toContain('<ul')
      expect(result.body).toContain('TV shows: No TV shows deleted')
    })

    it('should report protected counts when present', () => {
      const result = createDeleteSyncAppriseMessage(
        deleteSyncResult({
          total: { deleted: 0, skipped: 0, processed: 4, protected: 4 },
          movies: { deleted: 0, skipped: 0, protected: 3, items: [] },
        }),
        false,
      )

      expect(result.bodyHtml).toContain('>Protected</div>')
      expect(result.body).toContain('Protected: 4 items')
      expect(result.body).toContain('Movies: No movies deleted')
      expect(result.body).toContain(
        '4 items were preserved because they are in protected playlists.',
      )
    })
  })

  describe('createWatchlistAddedAppriseMessage', () => {
    const base = { title: 'Dune', username: 'alice' }

    it('should title movies by the event', () => {
      expect(
        createWatchlistAddedAppriseMessage(
          { ...base, type: 'movie' },
          'Alice A',
        ).title,
      ).toBe('Watchlist add: Dune')
    })

    it('should title shows by the event', () => {
      expect(
        createWatchlistAddedAppriseMessage({ ...base, type: 'show' }, 'Alice A')
          .title,
      ).toBe('Watchlist add: Dune')
    })

    it('should render the band, title and rows', () => {
      const result = createWatchlistAddedAppriseMessage(
        { ...base, type: 'movie' },
        'Alice A',
      )

      expect(result.bodyHtml).toContain('Watchlist add</td>')
      expect(result.bodyHtml).toContain('>Dune</h1>')
      expect(result.bodyHtml).toContain('>Type</td>')
      expect(result.bodyHtml).toContain('>Movie</td>')
      expect(result.bodyHtml).toContain('>Added by</td>')
      expect(result.bodyHtml).toContain('>Alice A</td>')
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

      expect(withExtras.bodyHtml).toContain(
        'src="https://image.tmdb.org/dune.jpg"',
      )
      expect(withExtras.bodyHtml).toContain(
        'href="https://www.themoviedb.org/movie/438631"',
      )
      expect(withExtras.body).toContain(
        'TMDB: https://www.themoviedb.org/movie/438631',
      )
      expect(withoutExtras.bodyHtml).not.toContain('<img')
      expect(withoutExtras.bodyHtml).not.toContain('View on TMDB')
      expect(withoutExtras.body).not.toContain('TMDB:')
    })
  })

  describe('createTestAppriseMessage', () => {
    it('should render the shared test copy in both bodies', () => {
      const result = createTestAppriseMessage()

      expect(result.title).toBe(TEST_NOTIFICATION.title)
      expect(result.bodyHtml).toContain('Test</td>')
      expect(result.bodyHtml).toContain(`>${TEST_NOTIFICATION.title}</h1>`)
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
        trigger: 'quota_exceeded',
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

    it('should carry the band but no footer, branding sign-off or arrow glyph', () => {
      for (const output of outputs) {
        expect(output.bodyHtml).toContain('>Pulsarr</td>')
        expect(output.bodyHtml).not.toContain('Sent by Pulsarr')
      }
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
