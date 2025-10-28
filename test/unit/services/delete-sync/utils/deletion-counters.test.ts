import { DeletionCounters } from '@services/delete-sync/utils/deletion-counters.js'
import { describe, expect, it } from 'vitest'

describe('DeletionCounters', () => {
  describe('initialization', () => {
    it('should initialize with all counters at zero', () => {
      const counters = new DeletionCounters()

      expect(counters.moviesDeleted).toBe(0)
      expect(counters.moviesSkipped).toBe(0)
      expect(counters.moviesProtected).toBe(0)
      expect(counters.endedShowsDeleted).toBe(0)
      expect(counters.endedShowsSkipped).toBe(0)
      expect(counters.continuingShowsDeleted).toBe(0)
      expect(counters.continuingShowsSkipped).toBe(0)
      expect(counters.showsProtected).toBe(0)
    })

    it('should initialize with empty deletion records', () => {
      const counters = new DeletionCounters()

      expect(counters.moviesToDelete).toEqual([])
      expect(counters.showsToDelete).toEqual([])
    })
  })

  describe('movie counters', () => {
    it('should increment movie deleted counter and add record', () => {
      const counters = new DeletionCounters()
      const record = {
        title: 'Test Movie',
        guid: 'tmdb://12345',
        instance: 'Radarr-1',
      }

      counters.incrementMovieDeleted(record)

      expect(counters.moviesDeleted).toBe(1)
      expect(counters.moviesToDelete).toHaveLength(1)
      expect(counters.moviesToDelete[0]).toEqual(record)
    })

    it('should increment movie deleted counter multiple times', () => {
      const counters = new DeletionCounters()

      counters.incrementMovieDeleted({
        title: 'Movie 1',
        guid: 'tmdb://11111',
        instance: 'Radarr-1',
      })
      counters.incrementMovieDeleted({
        title: 'Movie 2',
        guid: 'tmdb://22222',
        instance: 'Radarr-1',
      })
      counters.incrementMovieDeleted({
        title: 'Movie 3',
        guid: 'tmdb://33333',
        instance: 'Radarr-2',
      })

      expect(counters.moviesDeleted).toBe(3)
      expect(counters.moviesToDelete).toHaveLength(3)
      expect(counters.moviesToDelete[0]?.title).toBe('Movie 1')
      expect(counters.moviesToDelete[1]?.title).toBe('Movie 2')
      expect(counters.moviesToDelete[2]?.title).toBe('Movie 3')
    })

    it('should increment movie skipped counter', () => {
      const counters = new DeletionCounters()

      counters.incrementMovieSkipped()
      counters.incrementMovieSkipped()

      expect(counters.moviesSkipped).toBe(2)
    })

    it('should increment movie protected counter', () => {
      const counters = new DeletionCounters()

      counters.incrementMovieProtected()
      counters.incrementMovieProtected()
      counters.incrementMovieProtected()

      expect(counters.moviesProtected).toBe(3)
    })

    it('should not add records for skipped or protected movies', () => {
      const counters = new DeletionCounters()

      counters.incrementMovieSkipped()
      counters.incrementMovieProtected()

      expect(counters.moviesToDelete).toHaveLength(0)
    })
  })

  describe('show counters', () => {
    it('should increment ended show deleted counter and add record', () => {
      const counters = new DeletionCounters()
      const record = {
        title: 'Ended Show',
        guid: 'tvdb://12345',
        instance: 'Sonarr-1',
      }

      counters.incrementShowDeleted(record, false) // false = ended show

      expect(counters.endedShowsDeleted).toBe(1)
      expect(counters.continuingShowsDeleted).toBe(0)
      expect(counters.showsToDelete).toHaveLength(1)
      expect(counters.showsToDelete[0]).toEqual(record)
    })

    it('should increment continuing show deleted counter and add record', () => {
      const counters = new DeletionCounters()
      const record = {
        title: 'Continuing Show',
        guid: 'tvdb://67890',
        instance: 'Sonarr-1',
      }

      counters.incrementShowDeleted(record, true) // true = continuing show

      expect(counters.continuingShowsDeleted).toBe(1)
      expect(counters.endedShowsDeleted).toBe(0)
      expect(counters.showsToDelete).toHaveLength(1)
      expect(counters.showsToDelete[0]).toEqual(record)
    })

    it('should track ended and continuing shows separately', () => {
      const counters = new DeletionCounters()

      counters.incrementShowDeleted(
        { title: 'Ended 1', guid: 'tvdb://1', instance: 'Sonarr-1' },
        false,
      )
      counters.incrementShowDeleted(
        { title: 'Continuing 1', guid: 'tvdb://2', instance: 'Sonarr-1' },
        true,
      )
      counters.incrementShowDeleted(
        { title: 'Ended 2', guid: 'tvdb://3', instance: 'Sonarr-1' },
        false,
      )

      expect(counters.endedShowsDeleted).toBe(2)
      expect(counters.continuingShowsDeleted).toBe(1)
      expect(counters.showsToDelete).toHaveLength(3)
    })

    it('should increment ended show skipped counter', () => {
      const counters = new DeletionCounters()

      counters.incrementShowSkipped(false) // false = ended show
      counters.incrementShowSkipped(false)

      expect(counters.endedShowsSkipped).toBe(2)
      expect(counters.continuingShowsSkipped).toBe(0)
    })

    it('should increment continuing show skipped counter', () => {
      const counters = new DeletionCounters()

      counters.incrementShowSkipped(true) // true = continuing show
      counters.incrementShowSkipped(true)
      counters.incrementShowSkipped(true)

      expect(counters.continuingShowsSkipped).toBe(3)
      expect(counters.endedShowsSkipped).toBe(0)
    })

    it('should increment show protected counter', () => {
      const counters = new DeletionCounters()

      counters.incrementShowProtected()
      counters.incrementShowProtected()

      expect(counters.showsProtected).toBe(2)
    })

    it('should not add records for skipped or protected shows', () => {
      const counters = new DeletionCounters()

      counters.incrementShowSkipped(true)
      counters.incrementShowSkipped(false)
      counters.incrementShowProtected()

      expect(counters.showsToDelete).toHaveLength(0)
    })
  })

  describe('totals and aggregates', () => {
    it('should calculate total deleted across all types', () => {
      const counters = new DeletionCounters()

      counters.incrementMovieDeleted({
        title: 'Movie',
        guid: 'tmdb://1',
        instance: 'Radarr-1',
      })
      counters.incrementShowDeleted(
        { title: 'Ended Show', guid: 'tvdb://2', instance: 'Sonarr-1' },
        false,
      )
      counters.incrementShowDeleted(
        { title: 'Continuing Show', guid: 'tvdb://3', instance: 'Sonarr-1' },
        true,
      )

      expect(counters.totalDeleted).toBe(3)
    })

    it('should calculate total skipped across all types', () => {
      const counters = new DeletionCounters()

      counters.incrementMovieSkipped()
      counters.incrementMovieSkipped()
      counters.incrementShowSkipped(false) // ended
      counters.incrementShowSkipped(true) // continuing
      counters.incrementShowSkipped(true) // continuing

      expect(counters.totalSkipped).toBe(5)
    })

    it('should calculate total protected across all types', () => {
      const counters = new DeletionCounters()

      counters.incrementMovieProtected()
      counters.incrementShowProtected()
      counters.incrementShowProtected()

      expect(counters.totalProtected).toBe(3)
    })

    it('should calculate total processed (deleted + skipped + protected)', () => {
      const counters = new DeletionCounters()

      // Deleted
      counters.incrementMovieDeleted({
        title: 'Movie',
        guid: 'tmdb://1',
        instance: 'Radarr-1',
      })
      counters.incrementShowDeleted(
        { title: 'Show', guid: 'tvdb://2', instance: 'Sonarr-1' },
        false,
      )

      // Skipped
      counters.incrementMovieSkipped()
      counters.incrementShowSkipped(true)

      // Protected
      counters.incrementMovieProtected()
      counters.incrementShowProtected()

      expect(counters.totalProcessed).toBe(6)
    })

    it('should calculate total shows deleted (ended + continuing)', () => {
      const counters = new DeletionCounters()

      counters.incrementShowDeleted(
        { title: 'Ended 1', guid: 'tvdb://1', instance: 'Sonarr-1' },
        false,
      )
      counters.incrementShowDeleted(
        { title: 'Ended 2', guid: 'tvdb://2', instance: 'Sonarr-1' },
        false,
      )
      counters.incrementShowDeleted(
        { title: 'Continuing 1', guid: 'tvdb://3', instance: 'Sonarr-1' },
        true,
      )

      expect(counters.totalShowsDeleted).toBe(3)
    })

    it('should calculate total shows skipped (ended + continuing)', () => {
      const counters = new DeletionCounters()

      counters.incrementShowSkipped(false)
      counters.incrementShowSkipped(true)
      counters.incrementShowSkipped(true)

      expect(counters.totalShowsSkipped).toBe(3)
    })
  })

  describe('deletion records immutability', () => {
    it('should return readonly deletion records', () => {
      const counters = new DeletionCounters()

      counters.incrementMovieDeleted({
        title: 'Movie',
        guid: 'tmdb://1',
        instance: 'Radarr-1',
      })

      const movies = counters.moviesToDelete
      const shows = counters.showsToDelete

      // TypeScript enforces readonly at compile time
      // At runtime, these are still regular arrays
      expect(Array.isArray(movies)).toBe(true)
      expect(Array.isArray(shows)).toBe(true)
    })

    it('should maintain separate records for movies and shows', () => {
      const counters = new DeletionCounters()

      const movieRecord = {
        title: 'Movie',
        guid: 'tmdb://1',
        instance: 'Radarr-1',
      }
      const showRecord = {
        title: 'Show',
        guid: 'tvdb://2',
        instance: 'Sonarr-1',
      }

      counters.incrementMovieDeleted(movieRecord)
      counters.incrementShowDeleted(showRecord, false)

      expect(counters.moviesToDelete).toHaveLength(1)
      expect(counters.showsToDelete).toHaveLength(1)
      expect(counters.moviesToDelete[0]).toEqual(movieRecord)
      expect(counters.showsToDelete[0]).toEqual(showRecord)
    })
  })

  describe('complex scenarios', () => {
    it('should handle mixed operations correctly', () => {
      const counters = new DeletionCounters()

      // Delete some items
      counters.incrementMovieDeleted({
        title: 'Movie 1',
        guid: 'tmdb://1',
        instance: 'Radarr-1',
      })
      counters.incrementMovieDeleted({
        title: 'Movie 2',
        guid: 'tmdb://2',
        instance: 'Radarr-1',
      })
      counters.incrementShowDeleted(
        { title: 'Ended Show', guid: 'tvdb://3', instance: 'Sonarr-1' },
        false,
      )
      counters.incrementShowDeleted(
        { title: 'Continuing Show', guid: 'tvdb://4', instance: 'Sonarr-1' },
        true,
      )

      // Skip some items
      counters.incrementMovieSkipped()
      counters.incrementShowSkipped(false)
      counters.incrementShowSkipped(true)

      // Protect some items
      counters.incrementMovieProtected()
      counters.incrementShowProtected()

      // Verify all counts
      expect(counters.moviesDeleted).toBe(2)
      expect(counters.endedShowsDeleted).toBe(1)
      expect(counters.continuingShowsDeleted).toBe(1)
      expect(counters.moviesSkipped).toBe(1)
      expect(counters.endedShowsSkipped).toBe(1)
      expect(counters.continuingShowsSkipped).toBe(1)
      expect(counters.moviesProtected).toBe(1)
      expect(counters.showsProtected).toBe(1)

      // Verify totals
      expect(counters.totalDeleted).toBe(4)
      expect(counters.totalSkipped).toBe(3)
      expect(counters.totalProtected).toBe(2)
      expect(counters.totalProcessed).toBe(9)

      // Verify records
      expect(counters.moviesToDelete).toHaveLength(2)
      expect(counters.showsToDelete).toHaveLength(2)
    })

    it('should handle zero deletions', () => {
      const counters = new DeletionCounters()

      counters.incrementMovieSkipped()
      counters.incrementShowProtected()

      expect(counters.totalDeleted).toBe(0)
      expect(counters.moviesToDelete).toHaveLength(0)
      expect(counters.showsToDelete).toHaveLength(0)
      expect(counters.totalProcessed).toBe(2)
    })
  })
})
