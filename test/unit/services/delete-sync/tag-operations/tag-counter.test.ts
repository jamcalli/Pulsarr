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
  let mockIsAnyGuidProtected: (guidList: string[]) => boolean
  let mockIsAnyGuidTracked: (guidList: string[]) => boolean

  beforeEach(() => {
    mockLogger = createMockLogger()
    mockTagCache = {
      getTagsForInstance: vi.fn(),
      getCompiledRegex: vi.fn((pattern: string) => new RegExp(pattern, 'iu')),
      clear: vi.fn(),
    } as unknown as TagCache
    mockIsAnyGuidProtected = vi.fn(() => false)
    mockIsAnyGuidTracked = vi.fn(() => true)
  })

  describe('countTaggedMovies', () => {
    let mockRadarrManager: RadarrManagerService
    let mockRadarrService: {
      getTags: ReturnType<typeof vi.fn>
    }

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
        deleteSyncTrackedOnly: false,
        removedTagPrefix: 'removed',
      }

      const count = await countTaggedMovies(
        movies,
        config,
        mockRadarrManager,
        mockTagCache,
        null,
        mockIsAnyGuidProtected,
        null,
        mockIsAnyGuidTracked,
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
        deleteSyncTrackedOnly: false,
        removedTagPrefix: 'removed',
      }

      const count = await countTaggedMovies(
        movies,
        config,
        mockRadarrManager,
        mockTagCache,
        null,
        mockIsAnyGuidProtected,
        null,
        mockIsAnyGuidTracked,
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
        deleteSyncTrackedOnly: false,
        removedTagPrefix: 'removed',
      }

      const count = await countTaggedMovies(
        movies,
        config,
        mockRadarrManager,
        mockTagCache,
        protectedGuids,
        mockIsAnyGuidProtected,
        null,
        mockIsAnyGuidTracked,
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
        deleteSyncTrackedOnly: false,
        removedTagPrefix: '', // empty
      }

      const count = await countTaggedMovies(
        movies,
        config,
        mockRadarrManager,
        mockTagCache,
        null,
        mockIsAnyGuidProtected,
        null,
        mockIsAnyGuidTracked,
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
        deleteSyncTrackedOnly: false,
        removedTagPrefix: 'removed', // No tags start with this
      }

      const count = await countTaggedMovies(
        movies,
        config,
        mockRadarrManager,
        mockTagCache,
        null,
        mockIsAnyGuidProtected,
        null,
        mockIsAnyGuidTracked,
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
        deleteSyncTrackedOnly: false,
        removedTagPrefix: 'removed',
      }

      const count = await countTaggedMovies(
        movies,
        config,
        mockRadarrManager,
        mockTagCache,
        null,
        mockIsAnyGuidProtected,
        null,
        mockIsAnyGuidTracked,
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
        deleteSyncTrackedOnly: false,
        removedTagPrefix: 'removed',
      }

      const count = await countTaggedMovies(
        movies,
        config,
        mockRadarrManager,
        mockTagCache,
        null,
        mockIsAnyGuidProtected,
        null,
        mockIsAnyGuidTracked,
        mockLogger,
      )

      expect(count).toBe(0)
    })

    it('should handle empty movie list', async () => {
      const config: TagCountConfig = {
        deleteMovie: true,
        deleteEndedShow: false,
        deleteContinuingShow: false,
        enablePlexPlaylistProtection: false,
        deleteSyncTrackedOnly: false,
        removedTagPrefix: 'removed',
      }

      const count = await countTaggedMovies(
        [],
        config,
        mockRadarrManager,
        mockTagCache,
        null,
        mockIsAnyGuidProtected,
        null,
        mockIsAnyGuidTracked,
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
        deleteSyncTrackedOnly: false,
        removedTagPrefix: 'removed',
      }

      const count = await countTaggedMovies(
        movies,
        config,
        mockRadarrManager,
        mockTagCache,
        null,
        mockIsAnyGuidProtected,
        null,
        mockIsAnyGuidTracked,
        mockLogger,
      )

      expect(count).toBe(2)
      // Should call getTagsForInstance for each unique instance
      expect(mockTagCache.getTagsForInstance).toHaveBeenCalledTimes(2)
    })

    it('should exclude movies with removal tag but no required regex match', async () => {
      const movies: RadarrItem[] = [
        {
          id: 1,
          title: 'Movie with removal tag only',
          tags: [1], // has removal tag but no user tag
          radarr_instance_id: 1,
          guids: 'tmdb://11111',
        } as unknown as RadarrItem,
        {
          id: 2,
          title: 'Movie with both tags',
          tags: [1, 2], // has both removal tag and user tag
          radarr_instance_id: 1,
          guids: 'tmdb://22222',
        } as unknown as RadarrItem,
      ]

      const tagMap = new Map([
        [1, 'removed'], // removal tag
        [2, 'user-john'], // matches regex
        [3, 'admin-jane'], // doesn't match regex
      ])
      vi.mocked(mockTagCache.getTagsForInstance).mockResolvedValue(tagMap)

      const config: TagCountConfig = {
        deleteMovie: true,
        deleteEndedShow: false,
        deleteContinuingShow: false,
        enablePlexPlaylistProtection: false,
        deleteSyncTrackedOnly: false,
        removedTagPrefix: 'removed',
        deleteSyncRequiredTagRegex: 'user-.*', // Requires a tag matching this pattern
      }

      const count = await countTaggedMovies(
        movies,
        config,
        mockRadarrManager,
        mockTagCache,
        null,
        mockIsAnyGuidProtected,
        null,
        mockIsAnyGuidTracked,
        mockLogger,
      )

      expect(count).toBe(1) // Only movie 2 has both removal tag AND required regex match
      expect(mockTagCache.getCompiledRegex).toHaveBeenCalledWith('user-.*')
    })

    it('should count all movies when they have both removal tag and required regex match', async () => {
      const movies: RadarrItem[] = [
        {
          id: 1,
          title: 'Movie 1',
          tags: [1, 2], // removal tag + user-john
          radarr_instance_id: 1,
          guids: 'tmdb://11111',
        } as unknown as RadarrItem,
        {
          id: 2,
          title: 'Movie 2',
          tags: [1, 3], // removal tag + user-jane
          radarr_instance_id: 1,
          guids: 'tmdb://22222',
        } as unknown as RadarrItem,
        {
          id: 3,
          title: 'Movie 3',
          tags: [1], // removal tag only (no user tag)
          radarr_instance_id: 1,
          guids: 'tmdb://33333',
        } as unknown as RadarrItem,
      ]

      const tagMap = new Map([
        [1, 'removed'], // removal tag
        [2, 'user-john'], // matches regex
        [3, 'user-jane'], // matches regex
      ])
      vi.mocked(mockTagCache.getTagsForInstance).mockResolvedValue(tagMap)

      const config: TagCountConfig = {
        deleteMovie: true,
        deleteEndedShow: false,
        deleteContinuingShow: false,
        enablePlexPlaylistProtection: false,
        deleteSyncTrackedOnly: false,
        removedTagPrefix: 'removed',
        deleteSyncRequiredTagRegex: 'user-.*',
      }

      const count = await countTaggedMovies(
        movies,
        config,
        mockRadarrManager,
        mockTagCache,
        null,
        mockIsAnyGuidProtected,
        null,
        mockIsAnyGuidTracked,
        mockLogger,
      )

      expect(count).toBe(2) // Only movies 1 and 2 have both required conditions
    })

    it('should count all movies with removal tag when no regex is configured', async () => {
      const movies: RadarrItem[] = [
        {
          id: 1,
          title: 'Movie 1',
          tags: [1], // just removal tag
          radarr_instance_id: 1,
          guids: 'tmdb://11111',
        } as unknown as RadarrItem,
        {
          id: 2,
          title: 'Movie 2',
          tags: [1, 2], // removal tag + user tag
          radarr_instance_id: 1,
          guids: 'tmdb://22222',
        } as unknown as RadarrItem,
      ]

      const tagMap = new Map([
        [1, 'removed'],
        [2, 'user-john'],
      ])
      vi.mocked(mockTagCache.getTagsForInstance).mockResolvedValue(tagMap)

      const config: TagCountConfig = {
        deleteMovie: true,
        deleteEndedShow: false,
        deleteContinuingShow: false,
        enablePlexPlaylistProtection: false,
        deleteSyncTrackedOnly: false,
        removedTagPrefix: 'removed',
        // No deleteSyncRequiredTagRegex - should count all with removal tag
      }

      const count = await countTaggedMovies(
        movies,
        config,
        mockRadarrManager,
        mockTagCache,
        null,
        mockIsAnyGuidProtected,
        null,
        mockIsAnyGuidTracked,
        mockLogger,
      )

      expect(count).toBe(2) // Both movies have removal tag
      expect(mockTagCache.getCompiledRegex).not.toHaveBeenCalled()
    })

    it('should exclude movies not in tracked set when deleteSyncTrackedOnly is true', async () => {
      const movies: RadarrItem[] = [
        {
          id: 1,
          title: 'Tracked movie with tag',
          tags: [1],
          radarr_instance_id: 1,
          guids: 'tmdb://tracked',
        } as unknown as RadarrItem,
        {
          id: 2,
          title: 'Untracked movie with tag',
          tags: [1],
          radarr_instance_id: 1,
          guids: 'tmdb://untracked',
        } as unknown as RadarrItem,
      ]

      const tagMap = new Map([[1, 'removed']])
      vi.mocked(mockTagCache.getTagsForInstance).mockResolvedValue(tagMap)

      const trackedGuids = new Set(['tmdb:tracked']) // normalized format
      mockIsAnyGuidTracked = vi.fn((guids) =>
        guids.some((g: string) => trackedGuids.has(g)),
      )

      const config: TagCountConfig = {
        deleteMovie: true,
        deleteEndedShow: false,
        deleteContinuingShow: false,
        enablePlexPlaylistProtection: false,
        deleteSyncTrackedOnly: true,
        removedTagPrefix: 'removed',
      }

      const count = await countTaggedMovies(
        movies,
        config,
        mockRadarrManager,
        mockTagCache,
        null,
        mockIsAnyGuidProtected,
        trackedGuids,
        mockIsAnyGuidTracked,
        mockLogger,
      )

      expect(count).toBe(1) // Only tracked movie counted
    })

    it('should count all tagged movies when deleteSyncTrackedOnly is false', async () => {
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
          radarr_instance_id: 1,
          guids: 'tmdb://22222',
        } as unknown as RadarrItem,
      ]

      const tagMap = new Map([[1, 'removed']])
      vi.mocked(mockTagCache.getTagsForInstance).mockResolvedValue(tagMap)

      const trackedGuids = new Set(['tmdb:11111']) // Only one tracked
      mockIsAnyGuidTracked = vi.fn((guids) =>
        guids.some((g: string) => trackedGuids.has(g)),
      )

      const config: TagCountConfig = {
        deleteMovie: true,
        deleteEndedShow: false,
        deleteContinuingShow: false,
        enablePlexPlaylistProtection: false,
        deleteSyncTrackedOnly: false, // Tracked-only disabled
        removedTagPrefix: 'removed',
      }

      const count = await countTaggedMovies(
        movies,
        config,
        mockRadarrManager,
        mockTagCache,
        null,
        mockIsAnyGuidProtected,
        trackedGuids,
        mockIsAnyGuidTracked,
        mockLogger,
      )

      expect(count).toBe(2) // Both movies counted even though only one is tracked
    })
  })

  describe('countTaggedSeries', () => {
    let mockSonarrManager: SonarrManagerService
    let mockSonarrService: {
      getTags: ReturnType<typeof vi.fn>
    }

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
        deleteSyncTrackedOnly: false,
        removedTagPrefix: 'removed',
      }

      const count = await countTaggedSeries(
        series,
        config,
        mockSonarrManager,
        mockTagCache,
        null,
        mockIsAnyGuidProtected,
        null,
        mockIsAnyGuidTracked,
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
        deleteSyncTrackedOnly: false,
        removedTagPrefix: 'removed',
      }

      const count = await countTaggedSeries(
        series,
        config,
        mockSonarrManager,
        mockTagCache,
        null,
        mockIsAnyGuidProtected,
        null,
        mockIsAnyGuidTracked,
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
        deleteSyncTrackedOnly: false,
        removedTagPrefix: 'removed',
      }

      const count = await countTaggedSeries(
        series,
        config,
        mockSonarrManager,
        mockTagCache,
        null,
        mockIsAnyGuidProtected,
        null,
        mockIsAnyGuidTracked,
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
        deleteSyncTrackedOnly: false,
        removedTagPrefix: 'removed',
      }

      const count = await countTaggedSeries(
        series,
        config,
        mockSonarrManager,
        mockTagCache,
        null,
        mockIsAnyGuidProtected,
        null,
        mockIsAnyGuidTracked,
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
        deleteSyncTrackedOnly: false,
        removedTagPrefix: 'removed',
      }

      const count = await countTaggedSeries(
        series,
        config,
        mockSonarrManager,
        mockTagCache,
        protectedGuids,
        mockIsAnyGuidProtected,
        null,
        mockIsAnyGuidTracked,
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
        deleteSyncTrackedOnly: false,
        removedTagPrefix: 'removed',
      }

      const count = await countTaggedSeries(
        series,
        config,
        mockSonarrManager,
        mockTagCache,
        null,
        mockIsAnyGuidProtected,
        null,
        mockIsAnyGuidTracked,
        mockLogger,
      )

      expect(count).toBe(0)
    })

    it('should handle empty series list', async () => {
      const config: TagCountConfig = {
        deleteMovie: false,
        deleteEndedShow: true,
        deleteContinuingShow: false,
        enablePlexPlaylistProtection: false,
        deleteSyncTrackedOnly: false,
        removedTagPrefix: 'removed',
      }

      const count = await countTaggedSeries(
        [],
        config,
        mockSonarrManager,
        mockTagCache,
        null,
        mockIsAnyGuidProtected,
        null,
        mockIsAnyGuidTracked,
        mockLogger,
      )

      expect(count).toBe(0)
    })

    it('should exclude series with removal tag but no required regex match', async () => {
      const series: SonarrItem[] = [
        {
          id: 1,
          title: 'Show with removal tag only',
          tags: [1], // has removal tag but no user tag
          sonarr_instance_id: 1,
          series_status: 'ended',
          guids: 'tvdb://11111',
        } as unknown as SonarrItem,
        {
          id: 2,
          title: 'Show with both tags',
          tags: [1, 2], // has both removal tag and user tag
          sonarr_instance_id: 1,
          series_status: 'ended',
          guids: 'tvdb://22222',
        } as unknown as SonarrItem,
      ]

      const tagMap = new Map([
        [1, 'removed'], // removal tag
        [2, 'user-john'], // matches regex
        [3, 'admin-jane'], // doesn't match regex
      ])
      vi.mocked(mockTagCache.getTagsForInstance).mockResolvedValue(tagMap)

      const config: TagCountConfig = {
        deleteMovie: false,
        deleteEndedShow: true,
        deleteContinuingShow: false,
        enablePlexPlaylistProtection: false,
        deleteSyncTrackedOnly: false,
        removedTagPrefix: 'removed',
        deleteSyncRequiredTagRegex: 'user-.*', // Requires a tag matching this pattern
      }

      const count = await countTaggedSeries(
        series,
        config,
        mockSonarrManager,
        mockTagCache,
        null,
        mockIsAnyGuidProtected,
        null,
        mockIsAnyGuidTracked,
        mockLogger,
      )

      expect(count).toBe(1) // Only show 2 has both removal tag AND required regex match
      expect(mockTagCache.getCompiledRegex).toHaveBeenCalledWith('user-.*')
    })

    it('should count all series when they have both removal tag and required regex match', async () => {
      const series: SonarrItem[] = [
        {
          id: 1,
          title: 'Show 1',
          tags: [1, 2], // removal tag + user-john
          sonarr_instance_id: 1,
          series_status: 'ended',
          guids: 'tvdb://11111',
        } as unknown as SonarrItem,
        {
          id: 2,
          title: 'Show 2',
          tags: [1, 3], // removal tag + user-jane
          sonarr_instance_id: 1,
          series_status: 'ended',
          guids: 'tvdb://22222',
        } as unknown as SonarrItem,
        {
          id: 3,
          title: 'Show 3',
          tags: [1], // removal tag only (no user tag)
          sonarr_instance_id: 1,
          series_status: 'ended',
          guids: 'tvdb://33333',
        } as unknown as SonarrItem,
      ]

      const tagMap = new Map([
        [1, 'removed'], // removal tag
        [2, 'user-john'], // matches regex
        [3, 'user-jane'], // matches regex
      ])
      vi.mocked(mockTagCache.getTagsForInstance).mockResolvedValue(tagMap)

      const config: TagCountConfig = {
        deleteMovie: false,
        deleteEndedShow: true,
        deleteContinuingShow: false,
        enablePlexPlaylistProtection: false,
        deleteSyncTrackedOnly: false,
        removedTagPrefix: 'removed',
        deleteSyncRequiredTagRegex: 'user-.*',
      }

      const count = await countTaggedSeries(
        series,
        config,
        mockSonarrManager,
        mockTagCache,
        null,
        mockIsAnyGuidProtected,
        null,
        mockIsAnyGuidTracked,
        mockLogger,
      )

      expect(count).toBe(2) // Only shows 1 and 2 have both required conditions
    })

    it('should count all series with removal tag when no regex is configured', async () => {
      const series: SonarrItem[] = [
        {
          id: 1,
          title: 'Show 1',
          tags: [1], // just removal tag
          sonarr_instance_id: 1,
          series_status: 'ended',
          guids: 'tvdb://11111',
        } as unknown as SonarrItem,
        {
          id: 2,
          title: 'Show 2',
          tags: [1, 2], // removal tag + user tag
          sonarr_instance_id: 1,
          series_status: 'ended',
          guids: 'tvdb://22222',
        } as unknown as SonarrItem,
      ]

      const tagMap = new Map([
        [1, 'removed'],
        [2, 'user-john'],
      ])
      vi.mocked(mockTagCache.getTagsForInstance).mockResolvedValue(tagMap)

      const config: TagCountConfig = {
        deleteMovie: false,
        deleteEndedShow: true,
        deleteContinuingShow: false,
        enablePlexPlaylistProtection: false,
        deleteSyncTrackedOnly: false,
        removedTagPrefix: 'removed',
        // No deleteSyncRequiredTagRegex - should count all with removal tag
      }

      const count = await countTaggedSeries(
        series,
        config,
        mockSonarrManager,
        mockTagCache,
        null,
        mockIsAnyGuidProtected,
        null,
        mockIsAnyGuidTracked,
        mockLogger,
      )

      expect(count).toBe(2) // Both shows have removal tag
      expect(mockTagCache.getCompiledRegex).not.toHaveBeenCalled()
    })

    it('should exclude series not in tracked set when deleteSyncTrackedOnly is true', async () => {
      const series: SonarrItem[] = [
        {
          id: 1,
          title: 'Tracked Show',
          tags: [1],
          sonarr_instance_id: 1,
          series_status: 'ended',
          guids: 'tvdb://tracked',
        } as unknown as SonarrItem,
        {
          id: 2,
          title: 'Untracked Show',
          tags: [1],
          sonarr_instance_id: 1,
          series_status: 'ended',
          guids: 'tvdb://untracked',
        } as unknown as SonarrItem,
      ]

      const tagMap = new Map([[1, 'removed']])
      vi.mocked(mockTagCache.getTagsForInstance).mockResolvedValue(tagMap)

      const trackedGuids = new Set(['tvdb:tracked']) // normalized format
      mockIsAnyGuidTracked = vi.fn((guids) =>
        guids.some((g: string) => trackedGuids.has(g)),
      )

      const config: TagCountConfig = {
        deleteMovie: false,
        deleteEndedShow: true,
        deleteContinuingShow: false,
        enablePlexPlaylistProtection: false,
        deleteSyncTrackedOnly: true,
        removedTagPrefix: 'removed',
      }

      const count = await countTaggedSeries(
        series,
        config,
        mockSonarrManager,
        mockTagCache,
        null,
        mockIsAnyGuidProtected,
        trackedGuids,
        mockIsAnyGuidTracked,
        mockLogger,
      )

      expect(count).toBe(1) // Only tracked show counted
    })

    it('should count all tagged series when deleteSyncTrackedOnly is false', async () => {
      const series: SonarrItem[] = [
        {
          id: 1,
          title: 'Show 1',
          tags: [1],
          sonarr_instance_id: 1,
          series_status: 'ended',
          guids: 'tvdb://11111',
        } as unknown as SonarrItem,
        {
          id: 2,
          title: 'Show 2',
          tags: [1],
          sonarr_instance_id: 1,
          series_status: 'ended',
          guids: 'tvdb://22222',
        } as unknown as SonarrItem,
      ]

      const tagMap = new Map([[1, 'removed']])
      vi.mocked(mockTagCache.getTagsForInstance).mockResolvedValue(tagMap)

      const trackedGuids = new Set(['tvdb:11111']) // Only one tracked
      mockIsAnyGuidTracked = vi.fn((guids) =>
        guids.some((g: string) => trackedGuids.has(g)),
      )

      const config: TagCountConfig = {
        deleteMovie: false,
        deleteEndedShow: true,
        deleteContinuingShow: false,
        enablePlexPlaylistProtection: false,
        deleteSyncTrackedOnly: false, // Tracked-only disabled
        removedTagPrefix: 'removed',
      }

      const count = await countTaggedSeries(
        series,
        config,
        mockSonarrManager,
        mockTagCache,
        null,
        mockIsAnyGuidProtected,
        trackedGuids,
        mockIsAnyGuidTracked,
        mockLogger,
      )

      expect(count).toBe(2) // Both shows counted even though only one is tracked
    })
  })
})
