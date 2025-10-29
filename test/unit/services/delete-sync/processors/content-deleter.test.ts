import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type { Item as SonarrItem } from '@root/types/sonarr.types.js'
import type { TagCache } from '@services/delete-sync/cache/index.js'
import {
  processMovieDeletions,
  processShowDeletions,
} from '@services/delete-sync/processors/content-deleter.js'
import { DeletionCounters } from '@services/delete-sync/utils/deletion-counters.js'
import type { ContentValidators } from '@services/delete-sync/validation/content-validator.js'
import type { RadarrService } from '@services/radarr.service.js'
import type { RadarrManagerService } from '@services/radarr-manager.service.js'
import type { SonarrService } from '@services/sonarr.service.js'
import type { SonarrManagerService } from '@services/sonarr-manager.service.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

// Mock the validation module
vi.mock('@services/delete-sync/validation/content-validator.js', async () => {
  const actual = await vi.importActual<
    typeof import('@services/delete-sync/validation/content-validator.js')
  >('@services/delete-sync/validation/content-validator.js')
  return {
    ...actual,
    validateTagBasedDeletion: vi.fn(),
    validateWatchlistDeletion: vi.fn(),
  }
})

import {
  validateTagBasedDeletion,
  validateWatchlistDeletion,
} from '@services/delete-sync/validation/content-validator.js'

describe('content-deleter', () => {
  let mockLogger: ReturnType<typeof createMockLogger>
  let mockValidators: ContentValidators
  let mockTagCache: TagCache
  let mockRadarrManager: RadarrManagerService
  let mockSonarrManager: SonarrManagerService
  let mockRadarrService: Partial<RadarrService>
  let mockSonarrService: Partial<SonarrService>

  beforeEach(() => {
    mockLogger = createMockLogger()
    mockValidators = {
      isAnyGuidTracked: vi.fn(() => true),
      isAnyGuidProtected: vi.fn(() => false),
    }
    mockTagCache = {
      getTagsForInstance: vi.fn(),
      clear: vi.fn(),
      getCompiledRegex: vi.fn(),
    } as unknown as TagCache

    mockRadarrService = {}
    mockSonarrService = {}

    mockRadarrManager = {
      getRadarrService: vi.fn(() => mockRadarrService as RadarrService),
    } as unknown as RadarrManagerService

    mockSonarrManager = {
      getSonarrService: vi.fn(() => mockSonarrService as SonarrService),
    } as unknown as SonarrManagerService

    vi.clearAllMocks()
  })

  describe('processMovieDeletions - skip counter', () => {
    it('should increment skip counter when movie has no removal tag', async () => {
      const movies: RadarrItem[] = [
        {
          id: 1,
          title: 'Movie Without Tag',
          tags: [],
          radarr_instance_id: 1,
          guids: 'tmdb://11111',
        } as unknown as RadarrItem,
      ]

      // Mock validation to return skip=true with reason 'no-removal-tag'
      vi.mocked(validateTagBasedDeletion).mockResolvedValue({
        skip: true,
        protected: false,
        reason: 'no-removal-tag',
      })

      const counters = new DeletionCounters()
      const deletedGuidsTracker = new Set<string>()

      await processMovieDeletions(
        {
          movies,
          config: {
            deletionMode: 'tag-based',
            deleteMovie: true,
            deleteFiles: false,
            deleteSyncTrackedOnly: false,
            enablePlexPlaylistProtection: false,
            removedTagPrefix: 'removed',
          },
          validators: mockValidators,
          radarrManager: mockRadarrManager,
          tagCache: mockTagCache,
          protectedGuids: null,
          logger: mockLogger,
          dryRun: false,
          deletedGuidsTracker,
        },
        counters,
      )

      expect(counters.moviesSkipped).toBe(1)
      expect(counters.moviesDeleted).toBe(0)
      expect(counters.moviesProtected).toBe(0)
      expect(counters.totalProcessed).toBe(1)
    })

    it('should increment skip counter when movie has no required tag regex match', async () => {
      const movies: RadarrItem[] = [
        {
          id: 1,
          title: 'Movie Without Required Tag',
          tags: [1],
          radarr_instance_id: 1,
          guids: 'tmdb://11111',
        } as unknown as RadarrItem,
      ]

      // Mock validation to return skip=true with reason 'no-required-tag'
      vi.mocked(validateTagBasedDeletion).mockResolvedValue({
        skip: true,
        protected: false,
        reason: 'no-required-tag',
      })

      const counters = new DeletionCounters()
      const deletedGuidsTracker = new Set<string>()

      await processMovieDeletions(
        {
          movies,
          config: {
            deletionMode: 'tag-based',
            deleteMovie: true,
            deleteFiles: false,
            deleteSyncTrackedOnly: false,
            enablePlexPlaylistProtection: false,
            removedTagPrefix: 'removed',
            deleteSyncRequiredTagRegex: 'user-.*',
          },
          validators: mockValidators,
          radarrManager: mockRadarrManager,
          tagCache: mockTagCache,
          protectedGuids: null,
          logger: mockLogger,
          dryRun: false,
          deletedGuidsTracker,
        },
        counters,
      )

      expect(counters.moviesSkipped).toBe(1)
      expect(counters.totalProcessed).toBe(1)
    })

    it('should increment skip counter when movie is not tracked', async () => {
      const movies: RadarrItem[] = [
        {
          id: 1,
          title: 'Untracked Movie',
          tags: [1],
          radarr_instance_id: 1,
          guids: 'tmdb://11111',
        } as unknown as RadarrItem,
      ]

      // Mock validation to return skip=true with notTracked=true
      vi.mocked(validateTagBasedDeletion).mockResolvedValue({
        skip: true,
        protected: false,
        notTracked: true,
      })

      const counters = new DeletionCounters()
      const deletedGuidsTracker = new Set<string>()

      await processMovieDeletions(
        {
          movies,
          config: {
            deletionMode: 'tag-based',
            deleteMovie: true,
            deleteFiles: false,
            deleteSyncTrackedOnly: true,
            enablePlexPlaylistProtection: false,
            removedTagPrefix: 'removed',
          },
          validators: mockValidators,
          radarrManager: mockRadarrManager,
          tagCache: mockTagCache,
          protectedGuids: null,
          logger: mockLogger,
          dryRun: false,
          deletedGuidsTracker,
        },
        counters,
      )

      expect(counters.moviesSkipped).toBe(1)
      expect(counters.totalProcessed).toBe(1)
    })

    it('should increment skip counter for watchlist items', async () => {
      const movies: RadarrItem[] = [
        {
          id: 1,
          title: 'Movie In Watchlist',
          tags: [],
          radarr_instance_id: 1,
          guids: 'tmdb://11111',
        } as unknown as RadarrItem,
      ]

      // Mock validation to return skip=true with reason 'in-watchlist'
      vi.mocked(validateWatchlistDeletion).mockReturnValue({
        skip: true,
        protected: false,
        reason: 'in-watchlist',
      })

      const counters = new DeletionCounters()
      const deletedGuidsTracker = new Set<string>()

      await processMovieDeletions(
        {
          movies,
          config: {
            deletionMode: 'watchlist',
            deleteMovie: true,
            deleteFiles: false,
            deleteSyncTrackedOnly: false,
            enablePlexPlaylistProtection: false,
            watchlistGuids: new Set(['tmdb://11111']),
          },
          validators: mockValidators,
          radarrManager: mockRadarrManager,
          tagCache: mockTagCache,
          protectedGuids: null,
          logger: mockLogger,
          dryRun: false,
          deletedGuidsTracker,
        },
        counters,
      )

      expect(counters.moviesSkipped).toBe(1)
      expect(counters.totalProcessed).toBe(1)
    })

    it('should increment skip counter for multiple skip reasons', async () => {
      const movies: RadarrItem[] = [
        {
          id: 1,
          title: 'Movie 1',
          tags: [],
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
        {
          id: 3,
          title: 'Movie 3',
          tags: [1],
          radarr_instance_id: 1,
          guids: 'tmdb://33333',
        } as unknown as RadarrItem,
      ]

      // Return different skip reasons for each movie
      vi.mocked(validateTagBasedDeletion)
        .mockResolvedValueOnce({
          skip: true,
          protected: false,
          reason: 'no-removal-tag',
        })
        .mockResolvedValueOnce({
          skip: true,
          protected: false,
          reason: 'no-required-tag',
        })
        .mockResolvedValueOnce({
          skip: true,
          protected: false,
          notTracked: true,
        })

      const counters = new DeletionCounters()
      const deletedGuidsTracker = new Set<string>()

      await processMovieDeletions(
        {
          movies,
          config: {
            deletionMode: 'tag-based',
            deleteMovie: true,
            deleteFiles: false,
            deleteSyncTrackedOnly: true,
            enablePlexPlaylistProtection: false,
            removedTagPrefix: 'removed',
            deleteSyncRequiredTagRegex: 'user-.*',
          },
          validators: mockValidators,
          radarrManager: mockRadarrManager,
          tagCache: mockTagCache,
          protectedGuids: null,
          logger: mockLogger,
          dryRun: false,
          deletedGuidsTracker,
        },
        counters,
      )

      expect(counters.moviesSkipped).toBe(3)
      expect(counters.moviesDeleted).toBe(0)
      expect(counters.totalProcessed).toBe(3)
    })
  })

  describe('processMovieDeletions - watchlist mode skip counter', () => {
    it('should increment skip counter for untracked movies in watchlist mode', async () => {
      const movies: RadarrItem[] = [
        {
          id: 1,
          title: 'Untracked Movie',
          tags: [],
          radarr_instance_id: 1,
          guids: 'tmdb://11111',
        } as unknown as RadarrItem,
      ]

      // Mock validation to return skip=true with notTracked=true in watchlist mode
      vi.mocked(validateWatchlistDeletion).mockReturnValue({
        skip: true,
        protected: false,
        notTracked: true,
      })

      const counters = new DeletionCounters()
      const deletedGuidsTracker = new Set<string>()

      await processMovieDeletions(
        {
          movies,
          config: {
            deletionMode: 'watchlist',
            deleteMovie: true,
            deleteFiles: false,
            deleteSyncTrackedOnly: true,
            enablePlexPlaylistProtection: false,
            watchlistGuids: new Set(),
          },
          validators: mockValidators,
          radarrManager: mockRadarrManager,
          tagCache: mockTagCache,
          protectedGuids: null,
          logger: mockLogger,
          dryRun: false,
          deletedGuidsTracker,
        },
        counters,
      )

      expect(counters.moviesSkipped).toBe(1)
      expect(counters.totalProcessed).toBe(1)
    })

    it('should increment skip counter for all watchlist skip reasons', async () => {
      const movies: RadarrItem[] = [
        {
          id: 1,
          title: 'In Watchlist',
          tags: [],
          radarr_instance_id: 1,
          guids: 'tmdb://11111',
        } as unknown as RadarrItem,
        {
          id: 2,
          title: 'Not Tracked',
          tags: [],
          radarr_instance_id: 1,
          guids: 'tmdb://22222',
        } as unknown as RadarrItem,
      ]

      vi.mocked(validateWatchlistDeletion)
        .mockReturnValueOnce({
          skip: true,
          protected: false,
          reason: 'in-watchlist',
        })
        .mockReturnValueOnce({
          skip: true,
          protected: false,
          notTracked: true,
        })

      const counters = new DeletionCounters()
      const deletedGuidsTracker = new Set<string>()

      await processMovieDeletions(
        {
          movies,
          config: {
            deletionMode: 'watchlist',
            deleteMovie: true,
            deleteFiles: false,
            deleteSyncTrackedOnly: true,
            enablePlexPlaylistProtection: false,
            watchlistGuids: new Set(['tmdb://11111']),
          },
          validators: mockValidators,
          radarrManager: mockRadarrManager,
          tagCache: mockTagCache,
          protectedGuids: null,
          logger: mockLogger,
          dryRun: false,
          deletedGuidsTracker,
        },
        counters,
      )

      expect(counters.moviesSkipped).toBe(2)
      expect(counters.totalProcessed).toBe(2)
    })
  })

  describe('processShowDeletions - skip counter', () => {
    it('should increment skip counter when show has no removal tag', async () => {
      const shows: SonarrItem[] = [
        {
          id: 1,
          title: 'Show Without Tag',
          tags: [],
          sonarr_instance_id: 1,
          series_status: 'ended',
          guids: 'tvdb://11111',
        } as unknown as SonarrItem,
      ]

      vi.mocked(validateTagBasedDeletion).mockResolvedValue({
        skip: true,
        protected: false,
        reason: 'no-removal-tag',
      })

      const counters = new DeletionCounters()
      const deletedGuidsTracker = new Set<string>()

      await processShowDeletions(
        {
          shows,
          config: {
            deletionMode: 'tag-based',
            deleteEndedShow: true,
            deleteContinuingShow: false,
            deleteFiles: false,
            deleteSyncTrackedOnly: false,
            enablePlexPlaylistProtection: false,
            removedTagPrefix: 'removed',
          },
          validators: mockValidators,
          sonarrManager: mockSonarrManager,
          tagCache: mockTagCache,
          protectedGuids: null,
          logger: mockLogger,
          dryRun: false,
          deletedGuidsTracker,
        },
        counters,
      )

      expect(counters.endedShowsSkipped).toBe(1)
      expect(counters.continuingShowsSkipped).toBe(0)
      expect(counters.totalShowsDeleted).toBe(0)
      expect(counters.totalProcessed).toBe(1)
    })

    it('should increment skip counter for continuing shows not tracked', async () => {
      const shows: SonarrItem[] = [
        {
          id: 1,
          title: 'Continuing Show',
          tags: [1],
          sonarr_instance_id: 1,
          series_status: 'continuing',
          guids: 'tvdb://11111',
        } as unknown as SonarrItem,
      ]

      vi.mocked(validateTagBasedDeletion).mockResolvedValue({
        skip: true,
        protected: false,
        notTracked: true,
      })

      const counters = new DeletionCounters()
      const deletedGuidsTracker = new Set<string>()

      await processShowDeletions(
        {
          shows,
          config: {
            deletionMode: 'tag-based',
            deleteEndedShow: false,
            deleteContinuingShow: true,
            deleteFiles: false,
            deleteSyncTrackedOnly: true,
            enablePlexPlaylistProtection: false,
            removedTagPrefix: 'removed',
          },
          validators: mockValidators,
          sonarrManager: mockSonarrManager,
          tagCache: mockTagCache,
          protectedGuids: null,
          logger: mockLogger,
          dryRun: false,
          deletedGuidsTracker,
        },
        counters,
      )

      expect(counters.continuingShowsSkipped).toBe(1)
      expect(counters.endedShowsSkipped).toBe(0)
      expect(counters.totalProcessed).toBe(1)
    })

    it('should track ended and continuing shows separately in skip counter', async () => {
      const shows: SonarrItem[] = [
        {
          id: 1,
          title: 'Ended Show',
          tags: [],
          sonarr_instance_id: 1,
          series_status: 'ended',
          guids: 'tvdb://11111',
        } as unknown as SonarrItem,
        {
          id: 2,
          title: 'Continuing Show',
          tags: [],
          sonarr_instance_id: 1,
          series_status: 'continuing',
          guids: 'tvdb://22222',
        } as unknown as SonarrItem,
      ]

      vi.mocked(validateTagBasedDeletion).mockResolvedValue({
        skip: true,
        protected: false,
        reason: 'no-removal-tag',
      })

      const counters = new DeletionCounters()
      const deletedGuidsTracker = new Set<string>()

      await processShowDeletions(
        {
          shows,
          config: {
            deletionMode: 'tag-based',
            deleteEndedShow: true,
            deleteContinuingShow: true,
            deleteFiles: false,
            deleteSyncTrackedOnly: false,
            enablePlexPlaylistProtection: false,
            removedTagPrefix: 'removed',
          },
          validators: mockValidators,
          sonarrManager: mockSonarrManager,
          tagCache: mockTagCache,
          protectedGuids: null,
          logger: mockLogger,
          dryRun: false,
          deletedGuidsTracker,
        },
        counters,
      )

      expect(counters.endedShowsSkipped).toBe(1)
      expect(counters.continuingShowsSkipped).toBe(1)
      expect(counters.totalShowsSkipped).toBe(2)
      expect(counters.totalProcessed).toBe(2)
    })
  })

  describe('processShowDeletions - watchlist mode skip counter', () => {
    it('should increment skip counter for shows in watchlist', async () => {
      const shows: SonarrItem[] = [
        {
          id: 1,
          title: 'Show In Watchlist',
          tags: [],
          sonarr_instance_id: 1,
          series_status: 'ended',
          guids: 'tvdb://11111',
        } as unknown as SonarrItem,
      ]

      vi.mocked(validateWatchlistDeletion).mockReturnValue({
        skip: true,
        protected: false,
        reason: 'in-watchlist',
      })

      const counters = new DeletionCounters()
      const deletedGuidsTracker = new Set<string>()

      await processShowDeletions(
        {
          shows,
          config: {
            deletionMode: 'watchlist',
            deleteEndedShow: true,
            deleteContinuingShow: false,
            deleteFiles: false,
            deleteSyncTrackedOnly: false,
            enablePlexPlaylistProtection: false,
            watchlistGuids: new Set(['tvdb://11111']),
          },
          validators: mockValidators,
          sonarrManager: mockSonarrManager,
          tagCache: mockTagCache,
          protectedGuids: null,
          logger: mockLogger,
          dryRun: false,
          deletedGuidsTracker,
        },
        counters,
      )

      expect(counters.endedShowsSkipped).toBe(1)
      expect(counters.totalProcessed).toBe(1)
    })

    it('should increment skip counter for untracked shows in watchlist mode', async () => {
      const shows: SonarrItem[] = [
        {
          id: 1,
          title: 'Untracked Continuing Show',
          tags: [],
          sonarr_instance_id: 1,
          series_status: 'continuing',
          guids: 'tvdb://11111',
        } as unknown as SonarrItem,
      ]

      vi.mocked(validateWatchlistDeletion).mockReturnValue({
        skip: true,
        protected: false,
        notTracked: true,
      })

      const counters = new DeletionCounters()
      const deletedGuidsTracker = new Set<string>()

      await processShowDeletions(
        {
          shows,
          config: {
            deletionMode: 'watchlist',
            deleteEndedShow: false,
            deleteContinuingShow: true,
            deleteFiles: false,
            deleteSyncTrackedOnly: true,
            enablePlexPlaylistProtection: false,
            watchlistGuids: new Set(),
          },
          validators: mockValidators,
          sonarrManager: mockSonarrManager,
          tagCache: mockTagCache,
          protectedGuids: null,
          logger: mockLogger,
          dryRun: false,
          deletedGuidsTracker,
        },
        counters,
      )

      expect(counters.continuingShowsSkipped).toBe(1)
      expect(counters.totalProcessed).toBe(1)
    })

    it('should increment skip counter for both watchlist skip reasons in shows', async () => {
      const shows: SonarrItem[] = [
        {
          id: 1,
          title: 'Ended Show In Watchlist',
          tags: [],
          sonarr_instance_id: 1,
          series_status: 'ended',
          guids: 'tvdb://11111',
        } as unknown as SonarrItem,
        {
          id: 2,
          title: 'Continuing Show Not Tracked',
          tags: [],
          sonarr_instance_id: 1,
          series_status: 'continuing',
          guids: 'tvdb://22222',
        } as unknown as SonarrItem,
      ]

      vi.mocked(validateWatchlistDeletion)
        .mockReturnValueOnce({
          skip: true,
          protected: false,
          reason: 'in-watchlist',
        })
        .mockReturnValueOnce({
          skip: true,
          protected: false,
          notTracked: true,
        })

      const counters = new DeletionCounters()
      const deletedGuidsTracker = new Set<string>()

      await processShowDeletions(
        {
          shows,
          config: {
            deletionMode: 'watchlist',
            deleteEndedShow: true,
            deleteContinuingShow: true,
            deleteFiles: false,
            deleteSyncTrackedOnly: true,
            enablePlexPlaylistProtection: false,
            watchlistGuids: new Set(['tvdb://11111']),
          },
          validators: mockValidators,
          sonarrManager: mockSonarrManager,
          tagCache: mockTagCache,
          protectedGuids: null,
          logger: mockLogger,
          dryRun: false,
          deletedGuidsTracker,
        },
        counters,
      )

      expect(counters.endedShowsSkipped).toBe(1)
      expect(counters.continuingShowsSkipped).toBe(1)
      expect(counters.totalShowsSkipped).toBe(2)
      expect(counters.totalProcessed).toBe(2)
    })
  })

  describe('processMovieDeletions - successful deletion', () => {
    it('should increment deleted counter when validation passes', async () => {
      const movies: RadarrItem[] = [
        {
          id: 1,
          title: 'Movie To Delete',
          tags: [1],
          radarr_instance_id: 1,
          guids: 'tmdb://11111',
        } as unknown as RadarrItem,
      ]

      vi.mocked(validateTagBasedDeletion).mockResolvedValue({
        skip: false,
        protected: false,
      })

      // Mock the service's deleteFromRadarr method
      mockRadarrService.deleteFromRadarr = vi.fn().mockResolvedValue(undefined)

      const counters = new DeletionCounters()
      const deletedGuidsTracker = new Set<string>()

      await processMovieDeletions(
        {
          movies,
          config: {
            deletionMode: 'tag-based',
            deleteMovie: true,
            deleteFiles: false,
            deleteSyncTrackedOnly: false,
            enablePlexPlaylistProtection: false,
            removedTagPrefix: 'removed',
          },
          validators: mockValidators,
          radarrManager: mockRadarrManager,
          tagCache: mockTagCache,
          protectedGuids: null,
          logger: mockLogger,
          dryRun: false,
          deletedGuidsTracker,
        },
        counters,
      )

      expect(counters.moviesDeleted).toBe(1)
      expect(counters.moviesSkipped).toBe(0)
      expect(counters.moviesProtected).toBe(0)
      expect(counters.totalProcessed).toBe(1)
      expect(mockRadarrService.deleteFromRadarr).toHaveBeenCalledWith(
        movies[0],
        false,
      )
      expect(validateTagBasedDeletion).toHaveBeenCalledWith(
        1,
        mockRadarrService,
        [1],
        ['tmdb:11111'],
        'Movie To Delete',
        'radarr',
        expect.objectContaining({
          deletionMode: 'tag-based',
          removedTagPrefix: 'removed',
        }),
        mockValidators,
        mockTagCache,
        mockLogger,
        null,
      )
    })

    it('should increment deleted counter with deleteFiles=true', async () => {
      const movies: RadarrItem[] = [
        {
          id: 2,
          title: 'Movie With Files',
          tags: [1],
          radarr_instance_id: 1,
          guids: 'tmdb://22222',
        } as unknown as RadarrItem,
      ]

      vi.mocked(validateTagBasedDeletion).mockResolvedValue({
        skip: false,
        protected: false,
      })

      mockRadarrService.deleteFromRadarr = vi.fn().mockResolvedValue(undefined)

      const counters = new DeletionCounters()
      const deletedGuidsTracker = new Set<string>()

      await processMovieDeletions(
        {
          movies,
          config: {
            deletionMode: 'tag-based',
            deleteMovie: true,
            deleteFiles: true,
            deleteSyncTrackedOnly: false,
            enablePlexPlaylistProtection: false,
            removedTagPrefix: 'removed',
          },
          validators: mockValidators,
          radarrManager: mockRadarrManager,
          tagCache: mockTagCache,
          protectedGuids: null,
          logger: mockLogger,
          dryRun: false,
          deletedGuidsTracker,
        },
        counters,
      )

      expect(counters.moviesDeleted).toBe(1)
      expect(mockRadarrService.deleteFromRadarr).toHaveBeenCalledWith(
        movies[0],
        true,
      )
    })
  })

  describe('processMovieDeletions - protected items', () => {
    it('should increment protected counter when item is protected', async () => {
      const movies: RadarrItem[] = [
        {
          id: 1,
          title: 'Protected Movie',
          tags: [1],
          radarr_instance_id: 1,
          guids: 'tmdb://11111',
        } as unknown as RadarrItem,
      ]

      vi.mocked(validateTagBasedDeletion).mockResolvedValue({
        skip: false,
        protected: true,
      })

      mockRadarrService.deleteFromRadarr = vi.fn()

      const counters = new DeletionCounters()
      const deletedGuidsTracker = new Set<string>()

      await processMovieDeletions(
        {
          movies,
          config: {
            deletionMode: 'tag-based',
            deleteMovie: true,
            deleteFiles: false,
            deleteSyncTrackedOnly: false,
            enablePlexPlaylistProtection: true,
            removedTagPrefix: 'removed',
          },
          validators: mockValidators,
          radarrManager: mockRadarrManager,
          tagCache: mockTagCache,
          protectedGuids: new Set(['tmdb:11111']),
          logger: mockLogger,
          dryRun: false,
          deletedGuidsTracker,
          playlistName: 'Do Not Delete',
        },
        counters,
      )

      expect(counters.moviesProtected).toBe(1)
      expect(counters.moviesDeleted).toBe(0)
      expect(counters.moviesSkipped).toBe(0)
      expect(counters.totalProcessed).toBe(1)
      expect(mockRadarrService.deleteFromRadarr).not.toHaveBeenCalled()
    })
  })

  describe('processShowDeletions - successful deletion', () => {
    it('should increment deleted counter for ended show', async () => {
      const shows: SonarrItem[] = [
        {
          id: 1,
          title: 'Ended Show To Delete',
          tags: [1],
          sonarr_instance_id: 1,
          series_status: 'ended',
          guids: 'tvdb://11111',
        } as unknown as SonarrItem,
      ]

      vi.mocked(validateTagBasedDeletion).mockResolvedValue({
        skip: false,
        protected: false,
      })

      mockSonarrService.deleteFromSonarr = vi.fn().mockResolvedValue(undefined)

      const counters = new DeletionCounters()
      const deletedGuidsTracker = new Set<string>()

      await processShowDeletions(
        {
          shows,
          config: {
            deletionMode: 'tag-based',
            deleteEndedShow: true,
            deleteContinuingShow: false,
            deleteFiles: false,
            deleteSyncTrackedOnly: false,
            enablePlexPlaylistProtection: false,
            removedTagPrefix: 'removed',
          },
          validators: mockValidators,
          sonarrManager: mockSonarrManager,
          tagCache: mockTagCache,
          protectedGuids: null,
          logger: mockLogger,
          dryRun: false,
          deletedGuidsTracker,
        },
        counters,
      )

      expect(counters.endedShowsDeleted).toBe(1)
      expect(counters.continuingShowsDeleted).toBe(0)
      expect(counters.totalShowsDeleted).toBe(1)
      expect(counters.totalShowsSkipped).toBe(0)
      expect(counters.showsProtected).toBe(0)
      expect(counters.totalProcessed).toBe(1)
      expect(mockSonarrService.deleteFromSonarr).toHaveBeenCalledWith(
        shows[0],
        false,
      )
    })

    it('should increment deleted counter for continuing show', async () => {
      const shows: SonarrItem[] = [
        {
          id: 2,
          title: 'Continuing Show To Delete',
          tags: [1],
          sonarr_instance_id: 1,
          series_status: 'continuing',
          guids: 'tvdb://22222',
        } as unknown as SonarrItem,
      ]

      vi.mocked(validateTagBasedDeletion).mockResolvedValue({
        skip: false,
        protected: false,
      })

      mockSonarrService.deleteFromSonarr = vi.fn().mockResolvedValue(undefined)

      const counters = new DeletionCounters()
      const deletedGuidsTracker = new Set<string>()

      await processShowDeletions(
        {
          shows,
          config: {
            deletionMode: 'tag-based',
            deleteEndedShow: false,
            deleteContinuingShow: true,
            deleteFiles: true,
            deleteSyncTrackedOnly: false,
            enablePlexPlaylistProtection: false,
            removedTagPrefix: 'removed',
          },
          validators: mockValidators,
          sonarrManager: mockSonarrManager,
          tagCache: mockTagCache,
          protectedGuids: null,
          logger: mockLogger,
          dryRun: false,
          deletedGuidsTracker,
        },
        counters,
      )

      expect(counters.continuingShowsDeleted).toBe(1)
      expect(counters.endedShowsDeleted).toBe(0)
      expect(counters.totalShowsDeleted).toBe(1)
      expect(counters.totalProcessed).toBe(1)
      expect(mockSonarrService.deleteFromSonarr).toHaveBeenCalledWith(
        shows[0],
        true,
      )
    })
  })

  describe('processShowDeletions - protected items', () => {
    it('should increment protected counter when show is protected', async () => {
      const shows: SonarrItem[] = [
        {
          id: 1,
          title: 'Protected Show',
          tags: [1],
          sonarr_instance_id: 1,
          series_status: 'ended',
          guids: 'tvdb://11111',
        } as unknown as SonarrItem,
      ]

      vi.mocked(validateWatchlistDeletion).mockReturnValue({
        skip: false,
        protected: true,
      })

      mockSonarrService.deleteFromSonarr = vi.fn()

      const counters = new DeletionCounters()
      const deletedGuidsTracker = new Set<string>()

      await processShowDeletions(
        {
          shows,
          config: {
            deletionMode: 'watchlist',
            deleteEndedShow: true,
            deleteContinuingShow: false,
            deleteFiles: false,
            deleteSyncTrackedOnly: false,
            enablePlexPlaylistProtection: true,
            watchlistGuids: new Set(),
          },
          validators: mockValidators,
          sonarrManager: mockSonarrManager,
          tagCache: mockTagCache,
          protectedGuids: new Set(['tvdb:11111']),
          logger: mockLogger,
          dryRun: false,
          deletedGuidsTracker,
          playlistName: 'Do Not Delete',
        },
        counters,
      )

      expect(counters.showsProtected).toBe(1)
      expect(counters.totalShowsDeleted).toBe(0)
      expect(counters.totalShowsSkipped).toBe(0)
      expect(counters.totalProcessed).toBe(1)
      expect(mockSonarrService.deleteFromSonarr).not.toHaveBeenCalled()
    })
  })
})
