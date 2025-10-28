import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type { Item as SonarrItem } from '@root/types/sonarr.types.js'
import type { TagCache } from '@services/delete-sync/cache/index.js'
import {
  countTaggedMovies,
  countTaggedSeries,
  type TagCountConfig,
} from '@services/delete-sync/tag-operations/tag-counter.js'
import type { RadarrManagerService } from '@services/radarr-manager.service.js'
import type { SonarrManagerService } from '@services/sonarr-manager.service.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

describe('tag-counter', () => {
  let mockLogger: ReturnType<typeof createMockLogger>
  let mockTagCache: TagCache
  let mockIsAnyGuidProtected: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockLogger = createMockLogger()
    mockTagCache = {
      getTagsForInstance: vi.fn(),
      clear: vi.fn(),
    } as unknown as TagCache
    mockIsAnyGuidProtected = vi.fn(() => false)
  })

  describe('countTaggedMovies', () => {
    let mockRadarrManager: RadarrManagerService
    let mockRadarrService: any

    beforeEach(() => {
      mockRadarrService = {
        getTags: vi.fn(),
      }
      mockRadarrManager = {
        getRadarrService: vi.fn(() => mockRadarrService),
      } as unknown as RadarrManagerService
    })

    it('should return 0 when deleteMovie is false', async () => {
      const movies: RadarrItem[] = [
        {
          id: 1,
          title: 'Movie 1',
          tags: [1, 2],
          radarr_instance_id: 1,
          guids: 'tmdb://12345',
        } as unknown as RadarrItem,
      ]

      const config: TagCountConfig = {
        deleteMovie: false,
        deleteEndedShow: false,
        deleteContinuingShow: false,
        enablePlexPlaylistProtection: false,
        removedTagPrefix: 'removed',
      }

      const count = await countTaggedMovies(
        movies,
        config,
        mockRadarrManager,
        mockTagCache,
        null,
        mockIsAnyGuidProtected,
        mockLogger,
      )

      expect(count).toBe(0)
      expect(mockTagCache.getTagsForInstance).not.toHaveBeenCalled()
    })

    it('should count movies with removal tag', async () => {
      const movies: RadarrItem[] = [
        {
          id: 1,
          title: 'Movie with tag',
          tags: [1], // has removal tag
          radarr_instance_id: 1,
          guids: 'tmdb://11111',
        } as unknown as RadarrItem,
        {
          id: 2,
          title: 'Movie without tag',
          tags: [2], // no removal tag
          radarr_instance_id: 1,
          guids: 'tmdb://22222',
        } as unknown as RadarrItem,
      ]

      const tagMap = new Map([
        [1, 'removed'], // removal tag
        [2, 'hd'],
      ])
      vi.mocked(mockTagCache.getTagsForInstance).mockResolvedValue(tagMap)

      const config: TagCountConfig = {
        deleteMovie: true,
        deleteEndedShow: false,
        deleteContinuingShow: false,
        enablePlexPlaylistProtection: false,
        removedTagPrefix: 'removed',
      }

      const count = await countTaggedMovies(
        movies,
        config,
        mockRadarrManager,
        mockTagCache,
        null,
        mockIsAnyGuidProtected,
        mockLogger,
      )

      expect(count).toBe(1) // Only movie 1 has removal tag
    })

    it('should exclude protected movies from count', async () => {
      const movies: RadarrItem[] = [
        {
          id: 1,
          title: 'Protected movie with tag',
          tags: [1],
          radarr_instance_id: 1,
          guids: 'tmdb://protected',
        } as unknown as RadarrItem,
        {
          id: 2,
          title: 'Unprotected movie with tag',
          tags: [1],
          radarr_instance_id: 1,
          guids: 'tmdb://unprotected',
        } as unknown as RadarrItem,
      ]

      const tagMap = new Map([[1, 'removed']])
      vi.mocked(mockTagCache.getTagsForInstance).mockResolvedValue(tagMap)

      const protectedGuids = new Set(['tmdb:protected']) // normalized format
      mockIsAnyGuidProtected = vi.fn((guids) =>
        guids.some((g: string) => protectedGuids.has(g)),
      )

      const config: TagCountConfig = {
        deleteMovie: true,
        deleteEndedShow: false,
        deleteContinuingShow: false,
        enablePlexPlaylistProtection: true,
        removedTagPrefix: 'removed',
      }

      const count = await countTaggedMovies(
        movies,
        config,
        mockRadarrManager,
        mockTagCache,
        protectedGuids,
        mockIsAnyGuidProtected,
        mockLogger,
      )

      expect(count).toBe(1) // Only unprotected movie counted
    })

    it('should return 0 when removedTagPrefix is empty', async () => {
      const movies: RadarrItem[] = [
        {
          id: 1,
          title: 'Movie',
          tags: [1],
          radarr_instance_id: 1,
          guids: 'tmdb://12345',
        } as unknown as RadarrItem,
      ]

      const tagMap = new Map([[1, 'removed']])
      vi.mocked(mockTagCache.getTagsForInstance).mockResolvedValue(tagMap)

      const config: TagCountConfig = {
        deleteMovie: true,
        deleteEndedShow: false,
        deleteContinuingShow: false,
        enablePlexPlaylistProtection: false,
        removedTagPrefix: '', // empty
      }

      const count = await countTaggedMovies(
        movies,
        config,
        mockRadarrManager,
        mockTagCache,
        null,
        mockIsAnyGuidProtected,
        mockLogger,
      )

      expect(count).toBe(0)
    })

    it('should return 0 when no tags match removal prefix', async () => {
      const movies: RadarrItem[] = [
        {
          id: 1,
          title: 'Movie',
          tags: [1, 2],
          radarr_instance_id: 1,
          guids: 'tmdb://12345',
        } as unknown as RadarrItem,
      ]

      const tagMap = new Map([
        [1, 'user-john'],
        [2, 'hd'],
      ])
      vi.mocked(mockTagCache.getTagsForInstance).mockResolvedValue(tagMap)

      const config: TagCountConfig = {
        deleteMovie: true,
        deleteEndedShow: false,
        deleteContinuingShow: false,
        enablePlexPlaylistProtection: false,
        removedTagPrefix: 'removed', // No tags start with this
      }

      const count = await countTaggedMovies(
        movies,
        config,
        mockRadarrManager,
        mockTagCache,
        null,
        mockIsAnyGuidProtected,
        mockLogger,
      )

      expect(count).toBe(0)
    })

    it('should handle movies without radarr_instance_id', async () => {
      const movies: RadarrItem[] = [
        {
          id: 1,
          title: 'Movie',
          tags: [1],
          radarr_instance_id: undefined,
          guids: 'tmdb://12345',
        } as unknown as RadarrItem,
      ]

      const config: TagCountConfig = {
        deleteMovie: true,
        deleteEndedShow: false,
        deleteContinuingShow: false,
        enablePlexPlaylistProtection: false,
        removedTagPrefix: 'removed',
      }

      const count = await countTaggedMovies(
        movies,
        config,
        mockRadarrManager,
        mockTagCache,
        null,
        mockIsAnyGuidProtected,
        mockLogger,
      )

      expect(count).toBe(0)
      expect(mockTagCache.getTagsForInstance).not.toHaveBeenCalled()
    })

    it('should skip instance when service not found', async () => {
      const movies: RadarrItem[] = [
        {
          id: 1,
          title: 'Movie',
          tags: [1],
          radarr_instance_id: 999, // non-existent
          guids: 'tmdb://12345',
        } as unknown as RadarrItem,
      ]

      vi.mocked(mockRadarrManager.getRadarrService).mockReturnValue(undefined)

      const config: TagCountConfig = {
        deleteMovie: true,
        deleteEndedShow: false,
        deleteContinuingShow: false,
        enablePlexPlaylistProtection: false,
        removedTagPrefix: 'removed',
      }

      const count = await countTaggedMovies(
        movies,
        config,
        mockRadarrManager,
        mockTagCache,
        null,
        mockIsAnyGuidProtected,
        mockLogger,
      )

      expect(count).toBe(0)
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Radarr service for instance 999 not found, skipping tag count',
      )
    })

    it('should handle empty movie list', async () => {
      const config: TagCountConfig = {
        deleteMovie: true,
        deleteEndedShow: false,
        deleteContinuingShow: false,
        enablePlexPlaylistProtection: false,
        removedTagPrefix: 'removed',
      }

      const count = await countTaggedMovies(
        [],
        config,
        mockRadarrManager,
        mockTagCache,
        null,
        mockIsAnyGuidProtected,
        mockLogger,
      )

      expect(count).toBe(0)
    })

    it('should group movies by instance', async () => {
      const movies: RadarrItem[] = [
        {
          id: 1,
          title: 'Movie 1',
          tags: [1],
          radarr_instance_id: 1,
          guids: 'tmdb://11111',
        } as unknown as RadarrItem,
        {
          id: 2,
          title: 'Movie 2',
          tags: [1],
          radarr_instance_id: 2,
          guids: 'tmdb://22222',
        } as unknown as RadarrItem,
      ]

      const tagMap = new Map([[1, 'removed']])
      vi.mocked(mockTagCache.getTagsForInstance).mockResolvedValue(tagMap)

      const config: TagCountConfig = {
        deleteMovie: true,
        deleteEndedShow: false,
        deleteContinuingShow: false,
        enablePlexPlaylistProtection: false,
        removedTagPrefix: 'removed',
      }

      const count = await countTaggedMovies(
        movies,
        config,
        mockRadarrManager,
        mockTagCache,
        null,
        mockIsAnyGuidProtected,
        mockLogger,
      )

      expect(count).toBe(2)
      // Should call getTagsForInstance for each unique instance
      expect(mockTagCache.getTagsForInstance).toHaveBeenCalledTimes(2)
    })
  })

  describe('countTaggedSeries', () => {
    let mockSonarrManager: SonarrManagerService
    let mockSonarrService: any

    beforeEach(() => {
      mockSonarrService = {
        getTags: vi.fn(),
      }
      mockSonarrManager = {
        getSonarrService: vi.fn(() => mockSonarrService),
      } as unknown as SonarrManagerService
    })

    it('should return 0 when both deleteEndedShow and deleteContinuingShow are false', async () => {
      const series: SonarrItem[] = [
        {
          id: 1,
          title: 'Show',
          tags: [1],
          sonarr_instance_id: 1,
          series_status: 'ended',
          guids: 'tvdb://12345',
        } as unknown as SonarrItem,
      ]

      const config: TagCountConfig = {
        deleteMovie: false,
        deleteEndedShow: false,
        deleteContinuingShow: false,
        enablePlexPlaylistProtection: false,
        removedTagPrefix: 'removed',
      }

      const count = await countTaggedSeries(
        series,
        config,
        mockSonarrManager,
        mockTagCache,
        null,
        mockIsAnyGuidProtected,
        mockLogger,
      )

      expect(count).toBe(0)
      expect(mockTagCache.getTagsForInstance).not.toHaveBeenCalled()
    })

    it('should only count ended shows when deleteEndedShow is true', async () => {
      const series: SonarrItem[] = [
        {
          id: 1,
          title: 'Ended Show',
          tags: [1],
          sonarr_instance_id: 1,
          series_status: 'ended',
          guids: 'tvdb://11111',
        } as unknown as SonarrItem,
        {
          id: 2,
          title: 'Continuing Show',
          tags: [1],
          sonarr_instance_id: 1,
          series_status: 'continuing',
          guids: 'tvdb://22222',
        } as unknown as SonarrItem,
      ]

      const tagMap = new Map([[1, 'removed']])
      vi.mocked(mockTagCache.getTagsForInstance).mockResolvedValue(tagMap)

      const config: TagCountConfig = {
        deleteMovie: false,
        deleteEndedShow: true,
        deleteContinuingShow: false,
        enablePlexPlaylistProtection: false,
        removedTagPrefix: 'removed',
      }

      const count = await countTaggedSeries(
        series,
        config,
        mockSonarrManager,
        mockTagCache,
        null,
        mockIsAnyGuidProtected,
        mockLogger,
      )

      expect(count).toBe(1) // Only ended show counted
    })

    it('should only count continuing shows when deleteContinuingShow is true', async () => {
      const series: SonarrItem[] = [
        {
          id: 1,
          title: 'Ended Show',
          tags: [1],
          sonarr_instance_id: 1,
          series_status: 'ended',
          guids: 'tvdb://11111',
        } as unknown as SonarrItem,
        {
          id: 2,
          title: 'Continuing Show',
          tags: [1],
          sonarr_instance_id: 1,
          series_status: 'continuing',
          guids: 'tvdb://22222',
        } as unknown as SonarrItem,
      ]

      const tagMap = new Map([[1, 'removed']])
      vi.mocked(mockTagCache.getTagsForInstance).mockResolvedValue(tagMap)

      const config: TagCountConfig = {
        deleteMovie: false,
        deleteEndedShow: false,
        deleteContinuingShow: true,
        enablePlexPlaylistProtection: false,
        removedTagPrefix: 'removed',
      }

      const count = await countTaggedSeries(
        series,
        config,
        mockSonarrManager,
        mockTagCache,
        null,
        mockIsAnyGuidProtected,
        mockLogger,
      )

      expect(count).toBe(1) // Only continuing show counted
    })

    it('should count both ended and continuing shows when both are enabled', async () => {
      const series: SonarrItem[] = [
        {
          id: 1,
          title: 'Ended Show',
          tags: [1],
          sonarr_instance_id: 1,
          series_status: 'ended',
          guids: 'tvdb://11111',
        } as unknown as SonarrItem,
        {
          id: 2,
          title: 'Continuing Show',
          tags: [1],
          sonarr_instance_id: 1,
          series_status: 'continuing',
          guids: 'tvdb://22222',
        } as unknown as SonarrItem,
      ]

      const tagMap = new Map([[1, 'removed']])
      vi.mocked(mockTagCache.getTagsForInstance).mockResolvedValue(tagMap)

      const config: TagCountConfig = {
        deleteMovie: false,
        deleteEndedShow: true,
        deleteContinuingShow: true,
        enablePlexPlaylistProtection: false,
        removedTagPrefix: 'removed',
      }

      const count = await countTaggedSeries(
        series,
        config,
        mockSonarrManager,
        mockTagCache,
        null,
        mockIsAnyGuidProtected,
        mockLogger,
      )

      expect(count).toBe(2)
    })

    it('should exclude protected shows from count', async () => {
      const series: SonarrItem[] = [
        {
          id: 1,
          title: 'Protected Show',
          tags: [1],
          sonarr_instance_id: 1,
          series_status: 'ended',
          guids: 'tvdb://protected',
        } as unknown as SonarrItem,
        {
          id: 2,
          title: 'Unprotected Show',
          tags: [1],
          sonarr_instance_id: 1,
          series_status: 'ended',
          guids: 'tvdb://unprotected',
        } as unknown as SonarrItem,
      ]

      const tagMap = new Map([[1, 'removed']])
      vi.mocked(mockTagCache.getTagsForInstance).mockResolvedValue(tagMap)

      const protectedGuids = new Set(['tvdb:protected']) // normalized format
      mockIsAnyGuidProtected = vi.fn((guids) =>
        guids.some((g: string) => protectedGuids.has(g)),
      )

      const config: TagCountConfig = {
        deleteMovie: false,
        deleteEndedShow: true,
        deleteContinuingShow: false,
        enablePlexPlaylistProtection: true,
        removedTagPrefix: 'removed',
      }

      const count = await countTaggedSeries(
        series,
        config,
        mockSonarrManager,
        mockTagCache,
        protectedGuids,
        mockIsAnyGuidProtected,
        mockLogger,
      )

      expect(count).toBe(1) // Only unprotected show counted
    })

    it('should skip instance when service not found', async () => {
      const series: SonarrItem[] = [
        {
          id: 1,
          title: 'Show',
          tags: [1],
          sonarr_instance_id: 999,
          series_status: 'ended',
          guids: 'tvdb://12345',
        } as unknown as SonarrItem,
      ]

      vi.mocked(mockSonarrManager.getSonarrService).mockReturnValue(undefined)

      const config: TagCountConfig = {
        deleteMovie: false,
        deleteEndedShow: true,
        deleteContinuingShow: false,
        enablePlexPlaylistProtection: false,
        removedTagPrefix: 'removed',
      }

      const count = await countTaggedSeries(
        series,
        config,
        mockSonarrManager,
        mockTagCache,
        null,
        mockIsAnyGuidProtected,
        mockLogger,
      )

      expect(count).toBe(0)
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Sonarr service for instance 999 not found, skipping tag count',
      )
    })

    it('should handle empty series list', async () => {
      const config: TagCountConfig = {
        deleteMovie: false,
        deleteEndedShow: true,
        deleteContinuingShow: false,
        enablePlexPlaylistProtection: false,
        removedTagPrefix: 'removed',
      }

      const count = await countTaggedSeries(
        [],
        config,
        mockSonarrManager,
        mockTagCache,
        null,
        mockIsAnyGuidProtected,
        mockLogger,
      )

      expect(count).toBe(0)
    })
  })
})
