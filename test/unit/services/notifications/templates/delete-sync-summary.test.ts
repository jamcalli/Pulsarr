import type { DeleteSyncResult } from '@root/types/delete-sync.types.js'
import {
  sectionEmptyText,
  sectionMoreText,
  summarizeDeleteSync,
} from '@services/notifications/templates/delete-sync-summary.js'
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

    expect(summary.title).toBe('Delete sync results')
    expect(summary.dryRun).toBe(false)
    expect(summary.summaryText).toBe(
      'Removed because no user has them on a watchlist anymore.',
    )
  })

  it('should title and describe a dry run', () => {
    const summary = summarizeDeleteSync(deleteSyncResult(), true)

    expect(summary.title).toBe('Delete sync simulation results')
    expect(summary.dryRun).toBe(true)
    expect(summary.summaryText).toBe(
      'This was a dry run, so nothing was deleted.',
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

    expect(summary.title).toBe('Delete sync safety triggered')
    expect(summary.summaryText).toBeUndefined()
    expect(summary.safetyMessage).toBe('Too many deletions')
  })

  it('should fall back to a generic safety sentence without a message', () => {
    const summary = summarizeDeleteSync(
      deleteSyncResult({ safetyTriggered: true }),
      false,
    )

    expect(summary.summaryText).toBeUndefined()
    expect(summary.safetyMessage).toBe(
      'A safety check prevented the delete sync operation from running.',
    )
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
    expect(summary.movies.noun).toEqual({ singular: 'movie', plural: 'movies' })
    expect(summary.movies.deleted).toBe(12)
    expect(summary.movies.shown).toHaveLength(10)
    expect(summary.movies.shown[0]).toBe('Movie 1')
    expect(summary.movies.remaining).toBe(2)
    expect(summary.movies.meta).toBe('12 deleted, 2 protected')
    expect(sectionMoreText(summary.movies)).toBe('+2 more movies')
  })

  it('should say would be deleted in a dry run meta', () => {
    const summary = summarizeDeleteSync(
      deleteSyncResult({
        movies: {
          deleted: 3,
          skipped: 0,
          protected: 1,
          items: deletedItems(3, 'Movie'),
        },
      }),
      true,
    )

    expect(summary.movies.meta).toBe('3 would be deleted, 1 protected')
  })

  it('should singularize a remainder of one', () => {
    const summary = summarizeDeleteSync(
      deleteSyncResult({
        shows: { deleted: 11, skipped: 0, items: deletedItems(11, 'Show') },
      }),
      false,
    )

    expect(sectionMoreText(summary.shows)).toBe('+1 more TV show')
  })

  it('should leave meta empty when nothing was deleted', () => {
    const summary = summarizeDeleteSync(
      deleteSyncResult({
        movies: { deleted: 0, skipped: 0, protected: 2, items: [] },
      }),
      false,
    )

    expect(summary.movies.meta).toBe('')
    expect(sectionEmptyText(summary.movies)).toBe('No movies deleted')
  })

  it('should leave the protected part out of meta and remaining zero for a small section', () => {
    const summary = summarizeDeleteSync(
      deleteSyncResult({
        shows: { deleted: 2, skipped: 0, items: deletedItems(2, 'Show') },
      }),
      false,
    )

    expect(summary.shows.label).toBe('TV shows')
    expect(summary.shows.noun).toEqual({
      singular: 'TV show',
      plural: 'TV shows',
    })
    expect(summary.shows.shown).toEqual(['Show 1', 'Show 2'])
    expect(summary.shows.remaining).toBe(0)
    expect(summary.shows.meta).toBe('2 deleted')
  })

  it('should pass the totals through untouched', () => {
    const total = { deleted: 12, skipped: 1, processed: 13, protected: 4 }
    const summary = summarizeDeleteSync(deleteSyncResult({ total }), false)

    expect(summary.totals).toEqual(total)
  })
})
