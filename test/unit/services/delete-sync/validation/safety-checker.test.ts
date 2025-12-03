import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type { Item as SonarrItem } from '@root/types/sonarr.types.js'
import { performSafetyCheck } from '@services/delete-sync/validation/index.js'
import { describe, expect, it } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

describe('performSafetyCheck', () => {
  const createMockMovies = (count: number): RadarrItem[] =>
    Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      title: `Movie ${i + 1}`,
      guids: `tmdb://${i + 1}`,
      type: 'movie',
    })) as unknown as RadarrItem[]

  const createMockSeries = (
    endedCount: number,
    continuingCount: number,
  ): SonarrItem[] => {
    const ended = Array.from({ length: endedCount }, (_, i) => ({
      id: i + 1,
      title: `Ended Show ${i + 1}`,
      series_status: 'ended',
      guids: `tvdb://${i + 1}`,
      type: 'series',
    })) as unknown as SonarrItem[]

    const continuing = Array.from({ length: continuingCount }, (_, i) => ({
      id: endedCount + i + 1,
      title: `Continuing Show ${i + 1}`,
      series_status: 'continuing',
      guids: `tvdb://${endedCount + i + 1}`,
      type: 'series',
    })) as unknown as SonarrItem[]

    return [...ended, ...continuing]
  }

  describe('basic safety checks', () => {
    it('should pass when deletion percentage is below threshold', () => {
      const movies = createMockMovies(100)
      const series = createMockSeries(50, 50)
      const config = {
        deleteMovie: true,
        deleteEndedShow: true,
        deleteContinuingShow: true,
        maxDeletionPrevention: 10,
      }

      // Tag 5 movies and 5 shows = 10 out of 200 = 5%
      const result = performSafetyCheck(
        series,
        movies,
        5, // tagged series
        5, // tagged movies
        config,
        createMockLogger(),
      )

      expect(result.passed).toBe(true)
      expect(result.totalItems).toBe(200)
      expect(result.itemsToDelete).toBe(10)
      expect(result.percentage).toBe(5)
      expect(result.errorMessage).toBeUndefined()
    })

    it('should pass when deletion percentage equals threshold', () => {
      const movies = createMockMovies(100)
      const series = createMockSeries(0, 0)
      const config = {
        deleteMovie: true,
        deleteEndedShow: true,
        deleteContinuingShow: true,
        maxDeletionPrevention: 10,
      }

      // Tag exactly 10 movies = 10%
      const result = performSafetyCheck(
        series,
        movies,
        0,
        10,
        config,
        createMockLogger(),
      )

      expect(result.passed).toBe(true)
      expect(result.totalItems).toBe(100)
      expect(result.itemsToDelete).toBe(10)
      expect(result.percentage).toBe(10)
    })

    it('should fail when deletion percentage exceeds threshold', () => {
      const movies = createMockMovies(100)
      const series = createMockSeries(0, 0)
      const config = {
        deleteMovie: true,
        deleteEndedShow: true,
        deleteContinuingShow: true,
        maxDeletionPrevention: 10,
      }

      // Tag 15 movies = 15%
      const result = performSafetyCheck(
        series,
        movies,
        0,
        15,
        config,
        createMockLogger(),
      )

      expect(result.passed).toBe(false)
      expect(result.totalItems).toBe(100)
      expect(result.itemsToDelete).toBe(15)
      expect(result.percentage).toBe(15)
      expect(result.errorMessage).toContain('Safety check failed')
      expect(result.errorMessage).toContain('15.00%')
      expect(result.errorMessage).toContain('10%')
    })

    it('should fail when no content exists', () => {
      const config = {
        deleteMovie: true,
        deleteEndedShow: true,
        deleteContinuingShow: true,
        maxDeletionPrevention: 10,
      }

      const result = performSafetyCheck(
        [],
        [],
        0,
        0,
        config,
        createMockLogger(),
      )

      expect(result.passed).toBe(false)
      expect(result.totalItems).toBe(0)
      expect(result.itemsToDelete).toBe(0)
      expect(result.percentage).toBe(0)
      expect(result.errorMessage).toBe('No content found in media servers')
    })
  })

  describe('config-based filtering', () => {
    it('should only count movies when deleteMovie is true', () => {
      const movies = createMockMovies(100)
      const series = createMockSeries(50, 50)
      const config = {
        deleteMovie: true,
        deleteEndedShow: false,
        deleteContinuingShow: false,
        maxDeletionPrevention: 10,
      }

      const result = performSafetyCheck(
        series,
        movies,
        0, // series not counted
        10, // movies counted
        config,
        createMockLogger(),
      )

      expect(result.totalItems).toBe(100) // Only movies
      expect(result.itemsToDelete).toBe(10)
      expect(result.percentage).toBe(10)
    })

    it('should not count movies when deleteMovie is false', () => {
      const movies = createMockMovies(100)
      const series = createMockSeries(50, 50)
      const config = {
        deleteMovie: false,
        deleteEndedShow: true,
        deleteContinuingShow: true,
        maxDeletionPrevention: 10,
      }

      const result = performSafetyCheck(
        series,
        movies,
        10, // series counted
        50, // movies NOT counted (should be 0)
        config,
        createMockLogger(),
      )

      expect(result.totalItems).toBe(100) // Only shows
      expect(result.itemsToDelete).toBe(10) // Only series
    })

    it('should only count ended shows when deleteEndedShow is true', () => {
      const movies = createMockMovies(0)
      const series = createMockSeries(50, 50)
      const config = {
        deleteMovie: false,
        deleteEndedShow: true,
        deleteContinuingShow: false,
        maxDeletionPrevention: 10,
      }

      const result = performSafetyCheck(
        series,
        movies,
        5, // only ended shows
        0,
        config,
        createMockLogger(),
      )

      expect(result.totalItems).toBe(50) // Only ended shows
      expect(result.itemsToDelete).toBe(5)
      expect(result.percentage).toBe(10)
    })

    it('should only count continuing shows when deleteContinuingShow is true', () => {
      const movies = createMockMovies(0)
      const series = createMockSeries(50, 50)
      const config = {
        deleteMovie: false,
        deleteEndedShow: false,
        deleteContinuingShow: true,
        maxDeletionPrevention: 10,
      }

      const result = performSafetyCheck(
        series,
        movies,
        5, // only continuing shows
        0,
        config,
        createMockLogger(),
      )

      expect(result.totalItems).toBe(50) // Only continuing shows
      expect(result.itemsToDelete).toBe(5)
      expect(result.percentage).toBe(10)
    })

    it('should count both ended and continuing shows when both are enabled', () => {
      const movies = createMockMovies(0)
      const series = createMockSeries(30, 70)
      const config = {
        deleteMovie: false,
        deleteEndedShow: true,
        deleteContinuingShow: true,
        maxDeletionPrevention: 10,
      }

      const result = performSafetyCheck(
        series,
        movies,
        10, // 10 shows total
        0,
        config,
        createMockLogger(),
      )

      expect(result.totalItems).toBe(100) // All shows
      expect(result.itemsToDelete).toBe(10)
      expect(result.percentage).toBe(10)
    })
  })

  describe('maxDeletionPrevention validation', () => {
    it('should fail with invalid string value', () => {
      const movies = createMockMovies(100)
      const config = {
        deleteMovie: true,
        deleteEndedShow: false,
        deleteContinuingShow: false,
        maxDeletionPrevention: 'invalid',
      }

      const result = performSafetyCheck(
        [],
        movies,
        0,
        10,
        config,
        createMockLogger(),
      )

      expect(result.passed).toBe(false)
      expect(result.errorMessage).toContain(
        'Invalid maxDeletionPrevention value',
      )
      expect(result.errorMessage).toContain('invalid')
    })

    it('should fail with negative value', () => {
      const movies = createMockMovies(100)
      const config = {
        deleteMovie: true,
        deleteEndedShow: false,
        deleteContinuingShow: false,
        maxDeletionPrevention: -5,
      }

      const result = performSafetyCheck(
        [],
        movies,
        0,
        10,
        config,
        createMockLogger(),
      )

      expect(result.passed).toBe(false)
      expect(result.errorMessage).toContain(
        'Invalid maxDeletionPrevention value',
      )
    })

    it('should fail with value over 100', () => {
      const movies = createMockMovies(100)
      const config = {
        deleteMovie: true,
        deleteEndedShow: false,
        deleteContinuingShow: false,
        maxDeletionPrevention: 150,
      }

      const result = performSafetyCheck(
        [],
        movies,
        0,
        10,
        config,
        createMockLogger(),
      )

      expect(result.passed).toBe(false)
      expect(result.errorMessage).toContain(
        'Invalid maxDeletionPrevention value',
      )
    })

    it('should accept string number value', () => {
      const movies = createMockMovies(100)
      const config = {
        deleteMovie: true,
        deleteEndedShow: false,
        deleteContinuingShow: false,
        maxDeletionPrevention: '20',
      }

      const result = performSafetyCheck(
        [],
        movies,
        0,
        10,
        config,
        createMockLogger(),
      )

      expect(result.passed).toBe(true)
      expect(result.percentage).toBe(10)
    })

    it('should use default value of 10 when undefined', () => {
      const movies = createMockMovies(100)
      const config = {
        deleteMovie: true,
        deleteEndedShow: false,
        deleteContinuingShow: false,
        maxDeletionPrevention: undefined as unknown as number,
      }

      // 11 movies = 11%, should fail with default 10% threshold
      const result = performSafetyCheck(
        [],
        movies,
        0,
        11,
        config,
        createMockLogger(),
      )

      expect(result.passed).toBe(false)
      expect(result.errorMessage).toContain('10%')
    })
  })

  describe('edge cases', () => {
    it('should handle 0% deletion', () => {
      const movies = createMockMovies(100)
      const config = {
        deleteMovie: true,
        deleteEndedShow: false,
        deleteContinuingShow: false,
        maxDeletionPrevention: 10,
      }

      const result = performSafetyCheck(
        [],
        movies,
        0,
        0,
        config,
        createMockLogger(),
      )

      expect(result.passed).toBe(true)
      expect(result.percentage).toBe(0)
      expect(result.itemsToDelete).toBe(0)
    })

    it('should handle 100% deletion when threshold allows', () => {
      const movies = createMockMovies(100)
      const config = {
        deleteMovie: true,
        deleteEndedShow: false,
        deleteContinuingShow: false,
        maxDeletionPrevention: 100,
      }

      const result = performSafetyCheck(
        [],
        movies,
        0,
        100,
        config,
        createMockLogger(),
      )

      expect(result.passed).toBe(true)
      expect(result.percentage).toBe(100)
      expect(result.itemsToDelete).toBe(100)
    })

    it('should handle very small percentages', () => {
      const movies = createMockMovies(10000)
      const config = {
        deleteMovie: true,
        deleteEndedShow: false,
        deleteContinuingShow: false,
        maxDeletionPrevention: 10,
      }

      // 1 movie out of 10000 = 0.01%
      const result = performSafetyCheck(
        [],
        movies,
        0,
        1,
        config,
        createMockLogger(),
      )

      expect(result.passed).toBe(true)
      expect(result.percentage).toBe(0.01)
      expect(result.itemsToDelete).toBe(1)
    })

    it('should handle threshold of 0%', () => {
      const movies = createMockMovies(100)
      const config = {
        deleteMovie: true,
        deleteEndedShow: false,
        deleteContinuingShow: false,
        maxDeletionPrevention: 0,
      }

      // Any deletion should fail with 0% threshold
      const result = performSafetyCheck(
        [],
        movies,
        0,
        1,
        config,
        createMockLogger(),
      )

      expect(result.passed).toBe(false)
      expect(result.errorMessage).toContain('0%')
    })

    it('should pass when exactly 0 items to delete with 0% threshold', () => {
      const movies = createMockMovies(100)
      const config = {
        deleteMovie: true,
        deleteEndedShow: false,
        deleteContinuingShow: false,
        maxDeletionPrevention: 0,
      }

      const result = performSafetyCheck(
        [],
        movies,
        0,
        0,
        config,
        createMockLogger(),
      )

      expect(result.passed).toBe(true)
      expect(result.percentage).toBe(0)
    })
  })

  describe('complex scenarios', () => {
    it('should handle mixed content types with different configs', () => {
      const movies = createMockMovies(100)
      const series = createMockSeries(50, 50)
      const config = {
        deleteMovie: true,
        deleteEndedShow: true,
        deleteContinuingShow: false,
        maxDeletionPrevention: 15,
      }

      // Total eligible: 100 movies + 50 ended shows = 150
      // Tagged: 10 movies + 5 ended shows = 15 = 10%
      const result = performSafetyCheck(
        series,
        movies,
        5, // tagged ended shows
        10, // tagged movies
        config,
        createMockLogger(),
      )

      expect(result.passed).toBe(true)
      expect(result.totalItems).toBe(150)
      expect(result.itemsToDelete).toBe(15)
      expect(result.percentage).toBe(10)
    })

    it('should calculate percentage with decimal precision', () => {
      const movies = createMockMovies(333)
      const config = {
        deleteMovie: true,
        deleteEndedShow: false,
        deleteContinuingShow: false,
        maxDeletionPrevention: 10,
      }

      // 33 out of 333 = 9.909090...%
      const result = performSafetyCheck(
        [],
        movies,
        0,
        33,
        config,
        createMockLogger(),
      )

      expect(result.passed).toBe(true)
      expect(result.percentage).toBeCloseTo(9.909, 2)
    })
  })
})
