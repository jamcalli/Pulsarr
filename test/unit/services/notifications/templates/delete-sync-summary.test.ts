import type { DeleteSyncResult } from '@root/types/delete-sync.types.js'
import { summarizeDeleteSync } from '@services/notifications/templates/delete-sync-summary.js'
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

describe('summarizeDeleteSync', () => {
  it('should title and describe a live run', () => {
    const summary = summarizeDeleteSync(deleteSyncResult(), false)

    expect(summary.title).toBe('🗑️ Delete Sync Results')
    expect(summary.summaryText).toBe(
      "The following content was removed because it's no longer in any user's watchlist.",
    )
  })

  it('should title and describe a dry run', () => {
    const summary = summarizeDeleteSync(deleteSyncResult(), true)

    expect(summary.title).toBe('🔍 Delete Sync Simulation Results')
    expect(summary.summaryText).toBe(
      'This was a dry run - no content was actually deleted.',
    )
  })

  it('should title and describe a safety triggered run', () => {
    const summary = summarizeDeleteSync(
      deleteSyncResult({
        safetyTriggered: true,
        safetyMessage: 'Too many deletions',
      }),
      false,
    )

    expect(summary.title).toBe('⚠️ Delete Sync Safety Triggered')
    expect(summary.summaryText).toBe('Too many deletions')
    expect(summary.safetyMessage).toBe('Too many deletions')
  })

  it('should fall back to a generic safety sentence without a message', () => {
    const summary = summarizeDeleteSync(
      deleteSyncResult({ safetyTriggered: true }),
      false,
    )

    expect(summary.summaryText).toBe(
      'A safety check prevented the delete sync operation from running.',
    )
    expect(summary.safetyMessage).toBeUndefined()
  })

  it('should leave safetyMessage unset when safety did not trigger', () => {
    const summary = summarizeDeleteSync(
      deleteSyncResult({ safetyMessage: 'Ignored' }),
      false,
    )

    expect(summary.safetyMessage).toBeUndefined()
  })

  it('should supply the protected sentence only when items were protected', () => {
    expect(summarizeDeleteSync(deleteSyncResult(), false).protectedText).toBe(
      undefined,
    )

    const summary = summarizeDeleteSync(
      deleteSyncResult({
        total: { deleted: 0, skipped: 0, processed: 0, protected: 4 },
      }),
      false,
    )

    expect(summary.protectedText).toBe(
      '4 items were preserved because they are in protected playlists.',
    )
  })

  it('should cap a section at ten shown titles and count the remainder', () => {
    const summary = summarizeDeleteSync(
      deleteSyncResult({
        movies: {
          deleted: 12,
          skipped: 0,
          protected: 2,
          items: deletedItems(12, 'Movie'),
        },
      }),
      false,
    )

    expect(summary.movies.label).toBe('Movies')
    expect(summary.movies.noun).toBe('movies')
    expect(summary.movies.deleted).toBe(12)
    expect(summary.movies.shown).toHaveLength(10)
    expect(summary.movies.shown[0]).toBe('Movie 1')
    expect(summary.movies.remaining).toBe(2)
    expect(summary.movies.protectedInfo).toBe(' (2 protected)')
  })

  it('should leave protectedInfo empty and remaining zero for a small section', () => {
    const summary = summarizeDeleteSync(
      deleteSyncResult({
        shows: { deleted: 2, skipped: 0, items: deletedItems(2, 'Show') },
      }),
      false,
    )

    expect(summary.shows.label).toBe('TV Shows')
    expect(summary.shows.noun).toBe('TV shows')
    expect(summary.shows.shown).toEqual(['Show 1', 'Show 2'])
    expect(summary.shows.remaining).toBe(0)
    expect(summary.shows.protectedInfo).toBe('')
  })

  it('should pass the totals through untouched', () => {
    const total = { deleted: 12, skipped: 1, processed: 13, protected: 4 }
    const summary = summarizeDeleteSync(deleteSyncResult({ total }), false)

    expect(summary.totals).toEqual(total)
  })
})
