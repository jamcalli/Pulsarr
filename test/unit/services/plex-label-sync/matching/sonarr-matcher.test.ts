import type { SonarrSeriesWithTags } from '@root/types/plex-label-sync.types.js'
import type { PlexMetadata } from '@root/types/plex-server.types.js'
import {
  buildSonarrMatchingCache,
  clearSonarrMatchingCache,
  matchPlexSeriesToSonarr,
} from '@services/plex-label-sync/matching/sonarr-matcher.js'
import type { PlexServerService } from '@services/plex-server.service.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

// Helper to create minimal PlexMetadata with Location for sonarr matching
function createMockPlexMetadataWithLocation(
  locationPaths: Array<string | undefined>,
): PlexMetadata {
  return {
    ratingKey: '123',
    key: '/library/metadata/123',
    guid: 'plex://show/123',
    type: 'show',
    title: 'Test Series',
    Location: locationPaths
      .filter((path): path is string => path !== undefined)
      .map((path) => ({ path })),
  }
}

describe('sonarr-matcher', () => {
  let mockPlexServer: PlexServerService
  let mockLogger: ReturnType<typeof createMockLogger>

  beforeEach(() => {
    mockLogger = createMockLogger()
    mockPlexServer = {
      getMetadata: vi.fn(),
    } as unknown as PlexServerService
  })

  afterEach(() => {
    clearSonarrMatchingCache()
  })

  describe('matchPlexSeriesToSonarr', () => {
    describe('exact folder path matching', () => {
      it('should match Plex series to Sonarr by exact folder path', async () => {
        const plexItem = {
          ratingKey: '123',
          title: 'Test Series',
        }

        const sonarrSeries: SonarrSeriesWithTags[] = [
          {
            instanceId: 1,
            instanceName: 'sonarr-main',
            series: {
              id: 1,
              title: 'Test Series',
              path: '/tv/Test Series',
            },
            tags: ['drama'],
            rootFolder: undefined,
          },
        ]

        buildSonarrMatchingCache(sonarrSeries)

        vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
          createMockPlexMetadataWithLocation(['/tv/Test Series']),
        )

        const result = await matchPlexSeriesToSonarr(
          plexItem,
          sonarrSeries,
          mockPlexServer,
          mockLogger,
        )

        expect(result).toEqual({
          instanceId: 1,
          instanceName: 'sonarr-main',
          series: sonarrSeries[0].series,
          tags: ['drama'],
        })
        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            plexTitle: 'Test Series',
            sonarrTitle: 'Test Series',
            plexLocation: '/tv/Test Series',
            sonarrSeriesPath: '/tv/Test Series',
          }),
          'Found exact folder path match',
        )
      })

      it('should match with normalized paths for exact match', async () => {
        const plexItem = {
          ratingKey: '123',
          title: 'Test Series',
        }

        const sonarrSeries: SonarrSeriesWithTags[] = [
          {
            instanceId: 1,
            instanceName: 'sonarr-main',
            series: {
              id: 1,
              title: 'Test Series',
              path: '/tv/Test Series',
            },
            tags: [],
            rootFolder: undefined,
          },
        ]

        buildSonarrMatchingCache(sonarrSeries)

        vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
          createMockPlexMetadataWithLocation(['\\tv\\Test Series']),
        )

        const result = await matchPlexSeriesToSonarr(
          plexItem,
          sonarrSeries,
          mockPlexServer,
          mockLogger,
        )

        expect(result).toEqual({
          instanceId: 1,
          instanceName: 'sonarr-main',
          series: sonarrSeries[0].series,
          tags: [],
        })
      })

      it('should skip series with null or empty path when exact matching', async () => {
        const plexItem = {
          ratingKey: '123',
          title: 'Test Series',
        }

        const sonarrSeries: SonarrSeriesWithTags[] = [
          {
            instanceId: 1,
            instanceName: 'sonarr-1',
            series: {
              id: 1,
              title: 'Series With Null Path',
              path: undefined,
            },
            tags: [],
            rootFolder: undefined,
          },
          {
            instanceId: 2,
            instanceName: 'sonarr-2',
            series: {
              id: 2,
              title: 'Test Series',
              path: '/tv/Test Series',
            },
            tags: [],
            rootFolder: undefined,
          },
        ]

        buildSonarrMatchingCache(sonarrSeries)

        vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
          createMockPlexMetadataWithLocation(['/tv/Test Series']),
        )

        const result = await matchPlexSeriesToSonarr(
          plexItem,
          sonarrSeries,
          mockPlexServer,
          mockLogger,
        )

        expect(result).toEqual({
          instanceId: 2,
          instanceName: 'sonarr-2',
          series: sonarrSeries[1].series,
          tags: [],
        })
      })
    })

    describe('folder name matching', () => {
      it('should match Plex series to Sonarr by folder name', async () => {
        const plexItem = {
          ratingKey: '123',
          title: 'Test Series',
        }

        const sonarrSeries: SonarrSeriesWithTags[] = [
          {
            instanceId: 1,
            instanceName: 'sonarr-main',
            series: {
              id: 1,
              title: 'Test Series',
              path: '/sonarr-tv/Test Series',
            },
            tags: ['drama'],
            rootFolder: undefined,
          },
        ]

        buildSonarrMatchingCache(sonarrSeries)

        vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
          createMockPlexMetadataWithLocation(['/plex-tv/Test Series']),
        )

        const result = await matchPlexSeriesToSonarr(
          plexItem,
          sonarrSeries,
          mockPlexServer,
          mockLogger,
        )

        expect(result).toEqual({
          instanceId: 1,
          instanceName: 'sonarr-main',
          series: sonarrSeries[0].series,
          tags: ['drama'],
        })
        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            plexTitle: 'Test Series',
            sonarrTitle: 'Test Series',
            plexLocation: '/plex-tv/Test Series',
            sonarrFolderName: 'test series',
          }),
          'Found folder name match',
        )
      })

      it('should match folder names case-insensitively', async () => {
        const plexItem = {
          ratingKey: '123',
          title: 'Test Series',
        }

        const sonarrSeries: SonarrSeriesWithTags[] = [
          {
            instanceId: 1,
            instanceName: 'sonarr-main',
            series: {
              id: 1,
              title: 'Test Series',
              path: '/tv/TEST SERIES',
            },
            tags: [],
            rootFolder: undefined,
          },
        ]

        buildSonarrMatchingCache(sonarrSeries)

        vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
          createMockPlexMetadataWithLocation(['/plex/test series']),
        )

        const result = await matchPlexSeriesToSonarr(
          plexItem,
          sonarrSeries,
          mockPlexServer,
          mockLogger,
        )

        expect(result).toEqual({
          instanceId: 1,
          instanceName: 'sonarr-main',
          series: sonarrSeries[0].series,
          tags: [],
        })
      })

      it('should skip series with empty folder name', async () => {
        const plexItem = {
          ratingKey: '123',
          title: 'Test Series',
        }

        const sonarrSeries: SonarrSeriesWithTags[] = [
          {
            instanceId: 1,
            instanceName: 'sonarr-1',
            series: {
              id: 1,
              title: 'Empty Path',
              path: '',
            },
            tags: [],
            rootFolder: undefined,
          },
          {
            instanceId: 2,
            instanceName: 'sonarr-2',
            series: {
              id: 2,
              title: 'Test Series',
              path: '/tv/Test Series',
            },
            tags: [],
            rootFolder: undefined,
          },
        ]

        buildSonarrMatchingCache(sonarrSeries)

        vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
          createMockPlexMetadataWithLocation(['/plex/Test Series']),
        )

        const result = await matchPlexSeriesToSonarr(
          plexItem,
          sonarrSeries,
          mockPlexServer,
          mockLogger,
        )

        expect(result).toEqual({
          instanceId: 2,
          instanceName: 'sonarr-2',
          series: sonarrSeries[1].series,
          tags: [],
        })
      })
    })

    describe('no match scenarios', () => {
      it('should return null when metadata is null', async () => {
        const plexItem = {
          ratingKey: '123',
          title: 'Test Series',
        }

        const sonarrSeries: SonarrSeriesWithTags[] = []

        vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(null)

        const result = await matchPlexSeriesToSonarr(
          plexItem,
          sonarrSeries,
          mockPlexServer,
          mockLogger,
        )

        expect(result).toBeNull()
        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            ratingKey: '123',
            title: 'Test Series',
          }),
          'No metadata found for Plex series',
        )
      })

      it('should return null when no location in metadata', async () => {
        const plexItem = {
          ratingKey: '123',
          title: 'Test Series',
        }

        const sonarrSeries: SonarrSeriesWithTags[] = [
          {
            instanceId: 1,
            instanceName: 'sonarr-main',
            series: {
              id: 1,
              title: 'Test Series',
              path: '/tv/Test Series',
            },
            tags: [],
            rootFolder: '/tv',
          },
        ]

        buildSonarrMatchingCache(sonarrSeries)

        vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
          createMockPlexMetadataWithLocation([]),
        )

        const result = await matchPlexSeriesToSonarr(
          plexItem,
          sonarrSeries,
          mockPlexServer,
          mockLogger,
        )

        expect(result).toBeNull()
        // When there's no location, we return early after the initial matching log
        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            ratingKey: '123',
            title: 'Test Series',
            plexLocation: undefined,
            sonarrSeriesCount: 1,
          }),
          'Matching Plex series to Sonarr',
        )
      })

      it('should return null when location array is empty', async () => {
        const plexItem = {
          ratingKey: '123',
          title: 'Test Series',
        }

        const sonarrSeries: SonarrSeriesWithTags[] = [
          {
            instanceId: 1,
            instanceName: 'sonarr-main',
            series: {
              id: 1,
              title: 'Test Series',
              path: '/tv/Test Series',
            },
            tags: [],
            rootFolder: '/tv',
          },
        ]

        buildSonarrMatchingCache(sonarrSeries)

        vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
          createMockPlexMetadataWithLocation([]),
        )

        const result = await matchPlexSeriesToSonarr(
          plexItem,
          sonarrSeries,
          mockPlexServer,
          mockLogger,
        )

        expect(result).toBeNull()
      })

      it('should return null when no Sonarr series match', async () => {
        const plexItem = {
          ratingKey: '123',
          title: 'Test Series',
        }

        const sonarrSeries: SonarrSeriesWithTags[] = [
          {
            instanceId: 1,
            instanceName: 'sonarr-main',
            series: {
              id: 1,
              title: 'Different Series',
              path: '/tv/Different Series',
            },
            tags: [],
            rootFolder: '/tv',
          },
        ]

        buildSonarrMatchingCache(sonarrSeries)

        vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
          createMockPlexMetadataWithLocation(['/other/Test Series']),
        )

        const result = await matchPlexSeriesToSonarr(
          plexItem,
          sonarrSeries,
          mockPlexServer,
          mockLogger,
        )

        expect(result).toBeNull()
        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            ratingKey: '123',
            title: 'Test Series',
            plexLocation: '/other/Test Series',
          }),
          'No Sonarr match found for Plex series',
        )
      })

      it('should return null when sonarrSeries array is empty', async () => {
        const plexItem = {
          ratingKey: '123',
          title: 'Test Series',
        }

        const sonarrSeries: SonarrSeriesWithTags[] = []

        buildSonarrMatchingCache(sonarrSeries)

        vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
          createMockPlexMetadataWithLocation(['/tv/Test Series']),
        )

        const result = await matchPlexSeriesToSonarr(
          plexItem,
          sonarrSeries,
          mockPlexServer,
          mockLogger,
        )

        expect(result).toBeNull()
      })
    })

    describe('error handling', () => {
      it('should handle error when getting metadata', async () => {
        const plexItem = {
          ratingKey: '123',
          title: 'Test Series',
        }

        const sonarrSeries: SonarrSeriesWithTags[] = []

        vi.mocked(mockPlexServer.getMetadata).mockRejectedValue(
          new Error('Network error'),
        )

        const result = await matchPlexSeriesToSonarr(
          plexItem,
          sonarrSeries,
          mockPlexServer,
          mockLogger,
        )

        expect(result).toBeNull()
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({ error: expect.any(Error) }),
          'Error matching Plex series to Sonarr:',
        )
      })
    })

    describe('logging', () => {
      it('should log debug information during matching', async () => {
        const plexItem = {
          ratingKey: '123',
          title: 'Test Series',
        }

        const sonarrSeries: SonarrSeriesWithTags[] = [
          {
            instanceId: 1,
            instanceName: 'sonarr-main',
            series: {
              id: 1,
              title: 'Test Series',
              path: '/tv/Test Series',
            },
            tags: ['drama', 'comedy'],
            rootFolder: '/tv',
          },
        ]

        buildSonarrMatchingCache(sonarrSeries)

        vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
          createMockPlexMetadataWithLocation(['/tv/Test Series']),
        )

        await matchPlexSeriesToSonarr(
          plexItem,
          sonarrSeries,
          mockPlexServer,
          mockLogger,
        )

        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            ratingKey: '123',
            title: 'Test Series',
            plexLocation: '/tv/Test Series',
            sonarrSeriesCount: 1,
          }),
          'Matching Plex series to Sonarr',
        )
      })

      it('should log available paths when no match found', async () => {
        const plexItem = {
          ratingKey: '123',
          title: 'Test Series',
        }

        const sonarrSeries: SonarrSeriesWithTags[] = [
          {
            instanceId: 1,
            instanceName: 'sonarr-main',
            series: {
              id: 1,
              title: 'Different Series',
              path: '/tv/Different Series',
            },
            tags: [],
            rootFolder: '/tv',
          },
        ]

        buildSonarrMatchingCache(sonarrSeries)

        vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
          createMockPlexMetadataWithLocation(['/other/Test Series']),
        )

        await matchPlexSeriesToSonarr(
          plexItem,
          sonarrSeries,
          mockPlexServer,
          mockLogger,
        )

        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            plexTitle: 'Test Series',
            plexLocation: '/other/Test Series',
            availableSonarrPaths: [
              {
                instanceName: 'sonarr-main',
                seriesPath: '/tv/Different Series',
                rootFolder: '/tv',
              },
            ],
          }),
          'No match found with available strategies',
        )
      })

      it('should handle error during debug logging of available paths', async () => {
        const plexItem = {
          ratingKey: '123',
          title: 'Plex Series Name',
        }

        const sonarrSeries: SonarrSeriesWithTags[] = [
          {
            instanceId: 1,
            instanceName: 'sonarr-main',
            series: {
              id: 1,
              title: 'Different Sonarr Series',
              path: '/tv/Different Series',
            },
            tags: [],
            rootFolder: '/tv',
          },
        ]

        buildSonarrMatchingCache(sonarrSeries)

        vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
          createMockPlexMetadataWithLocation(['/other/Plex Series Name']),
        )

        // Make the logger throw an error when trying to log available paths
        vi.mocked(mockLogger.debug).mockImplementationOnce(() => {
          // First call (Matching Plex series to Sonarr) succeeds
        })
        vi.mocked(mockLogger.debug).mockImplementationOnce(() => {
          // Second call (logging available paths) throws an error
          throw new Error('Logging failed')
        })

        const result = await matchPlexSeriesToSonarr(
          plexItem,
          sonarrSeries,
          mockPlexServer,
          mockLogger,
        )

        expect(result).toBeNull()
        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({ error: expect.any(Error) }),
          'Error during folder matching fallback:',
        )
      })
    })

    describe('matching priority', () => {
      it('should match by exact path', async () => {
        const plexItem = {
          ratingKey: '123',
          title: 'Test Series',
        }

        const sonarrSeries: SonarrSeriesWithTags[] = [
          {
            instanceId: 1,
            instanceName: 'sonarr-other',
            series: {
              id: 1,
              title: 'Test Series',
              path: '/other/Test Series',
            },
            tags: ['other-match'],
            rootFolder: '/other',
          },
          {
            instanceId: 2,
            instanceName: 'sonarr-exact',
            series: {
              id: 2,
              title: 'Test Series',
              path: '/tv/Test Series',
            },
            tags: ['exact-match'],
            rootFolder: undefined,
          },
        ]

        buildSonarrMatchingCache(sonarrSeries)

        vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
          createMockPlexMetadataWithLocation(['/tv/Test Series']),
        )

        const result = await matchPlexSeriesToSonarr(
          plexItem,
          sonarrSeries,
          mockPlexServer,
          mockLogger,
        )

        // Should return the exact path match
        expect(result?.instanceName).toBe('sonarr-exact')
        expect(result?.tags).toEqual(['exact-match'])
      })

      it('should fallback to folder name when exact path does not match', async () => {
        const plexItem = {
          ratingKey: '123',
          title: 'Test Series',
        }

        const sonarrSeries: SonarrSeriesWithTags[] = [
          {
            instanceId: 1,
            instanceName: 'sonarr-exact',
            series: {
              id: 1,
              title: 'Test Series',
              path: '/other/Different Series',
            },
            tags: ['exact-match'],
            rootFolder: undefined,
          },
          {
            instanceId: 2,
            instanceName: 'sonarr-folder',
            series: {
              id: 2,
              title: 'Test Series',
              path: '/sonarr/Test Series',
            },
            tags: ['folder-match'],
            rootFolder: undefined,
          },
        ]

        buildSonarrMatchingCache(sonarrSeries)

        vi.mocked(mockPlexServer.getMetadata).mockResolvedValue(
          createMockPlexMetadataWithLocation(['/plex/Test Series']),
        )

        const result = await matchPlexSeriesToSonarr(
          plexItem,
          sonarrSeries,
          mockPlexServer,
          mockLogger,
        )

        // Should return the folder name match
        expect(result?.instanceName).toBe('sonarr-folder')
        expect(result?.tags).toEqual(['folder-match'])
      })
    })
  })
})
