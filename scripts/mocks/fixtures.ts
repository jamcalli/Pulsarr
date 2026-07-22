/**
 * Shared fixture data for local Radarr / Sonarr mock servers.
 */

import type {
  RadarrMovieLookupResponse,
  SonarrSeason,
  SonarrSeriesLookupResponse,
} from '../../src/types/content-lookup.types.js'
import type {
  PagedResult as RadarrPagedResult,
  QualityProfile as RadarrQualityProfile,
  RootFolder as RadarrRootFolder,
} from '../../src/types/radarr.types.js'
import type {
  SonarrEpisode,
  PagedResult as SonarrPagedResult,
  QualityProfile as SonarrQualityProfile,
  RootFolder as SonarrRootFolder,
  SonarrSeries,
} from '../../src/types/sonarr.types.js'
import type { SystemStatus } from '../../src/types/system-status.types.js'

// Mock payloads must stay assignable to the types Pulsarr parses responses
// into. Assignment (not satisfies) allows extra mock-only fields.
function expectAssignable<T>(_value: T): void {}

export const MOCK_API_KEY = 'mock-api-key'

export function createSystemStatus(appName: 'Radarr' | 'Sonarr') {
  return {
    appName,
    version: '5.0.0.0000',
    buildTime: '2024-01-01T00:00:00Z',
    isDebug: false,
    isProduction: true,
    isAdmin: true,
    isUserInteractive: false,
    startupPath: '/app',
    appData: '/config',
    osName: 'linux',
    osVersion: '6.0',
    isWindows: false,
    isLinux: true,
    isOsx: false,
    isDocker: true,
    mode: 'console',
    branch: 'master',
    authentication: 'none',
    sqliteVersion: '3.40.0',
    migrationVersion: 200,
    urlBase: '',
    runtimeVersion: '8.0.0',
    runtimeName: 'netcore',
    startTime: new Date().toISOString(),
    isNetCore: true,
    isMono: false,
    runtimeMode: 'Console',
  }
}

export const qualityProfiles = [
  {
    id: 1,
    name: 'HD-1080p',
    upgradeAllowed: true,
    cutoff: 7,
    items: [],
    minFormatScore: 0,
    cutoffFormatScore: 0,
    minUpgradeFormatScore: 1,
    formatItems: [],
  },
]

export const rootFolders = [
  {
    id: 1,
    path: '/data/media',
    accessible: true,
    freeSpace: 1_000_000_000_000,
    totalSpace: 2_000_000_000_000,
    unmappedFolders: [],
  },
]

export const defaultTags = [{ id: 1, label: 'pulsarr' }]

export function emptyPagedResult() {
  return {
    page: 1,
    pageSize: 1000,
    sortKey: 'id',
    sortDirection: 'ascending' as const,
    totalRecords: 0,
    records: [],
  }
}

expectAssignable<SystemStatus>(createSystemStatus('Radarr'))
expectAssignable<RadarrQualityProfile[]>(qualityProfiles)
expectAssignable<SonarrQualityProfile[]>(qualityProfiles)
expectAssignable<RadarrRootFolder[]>(rootFolders)
expectAssignable<SonarrRootFolder[]>(rootFolders)
expectAssignable<RadarrPagedResult<never>>(emptyPagedResult())
expectAssignable<SonarrPagedResult<never>>(emptyPagedResult())

export type ApplyTagsMode = 'add' | 'remove' | 'replace'

/** Absent applyTags defaults to add; invalid values return null. */
export function parseApplyTagsMode(
  value: unknown,
  fallback: ApplyTagsMode = 'add',
): ApplyTagsMode | null {
  if (value === undefined || value === null) {
    return fallback
  }
  if (value === 'add' || value === 'remove' || value === 'replace') {
    return value
  }
  return null
}

/** Apply Servarr bulk-editor tag semantics to an existing tag list. */
export function applyTags(
  current: number[],
  tags: number[],
  mode: ApplyTagsMode = 'replace',
): number[] {
  if (mode === 'replace') {
    return [...new Set(tags)]
  }
  if (mode === 'add') {
    return [...new Set([...current, ...tags])]
  }
  const remove = new Set(tags)
  return current.filter((tag) => !remove.has(tag))
}

/** Synthetic Radarr TMDB lookup payload used when a movie is not in the library. */
export function createRadarrTmdbLookup(tmdbId: number, title?: string) {
  return {
    id: 0,
    title: title ?? `Mock Movie ${tmdbId}`,
    tmdbId,
    year: 2024,
    monitored: false,
    hasFile: false,
    isAvailable: false,
    certification: 'R',
    genres: ['Action', 'Drama'],
    originalLanguage: { id: 1, name: 'English' },
    ratings: {
      imdb: { votes: 1000, value: 7.5, type: 'user' as const },
      tmdb: { votes: 500, value: 7.2, type: 'user' as const },
      rottenTomatoes: { votes: 100, value: 80, type: 'user' as const },
    },
  }
}

/** Synthetic Sonarr TVDB lookup payload; id 0 means not in the library. */
export function createSonarrTvdbLookup(tvdbId: number, title?: string) {
  return {
    id: 0,
    title: title ?? `Mock Series ${tvdbId}`,
    tvdbId,
    year: 2024,
    monitored: false,
    ended: false,
    status: 'continuing' as const,
  }
}

export interface MockEpisode {
  id: number
  seriesId: number
  episodeFileId: number
  seasonNumber: number
  episodeNumber: number
  title: string
  hasFile: boolean
  monitored: boolean
  unverifiedSceneNumbering: boolean
  grabbed: boolean
}

export interface MockEpisodeFile {
  id: number
  seriesId: number
  seasonNumber: number
  relativePath: string
  path: string
  size: number
}

export interface MockSeasonStatistics {
  episodeFileCount: number
  episodeCount: number
  totalEpisodeCount: number
  sizeOnDisk: number
  releaseGroups: string[]
  percentOfEpisodes: number
}

export interface MockSeason {
  seasonNumber: number
  monitored: boolean
  statistics: MockSeasonStatistics
}

export interface MockSeriesStatistics extends MockSeasonStatistics {
  seasonCount: number
}

const EPISODES_PER_SEASON = 5
const EPISODES_WITH_FILES = 2

/**
 * Seed season 1 with a handful of episodes (some with files) for session-monitor
 * and season-completion flows.
 */
export function seedSeriesEpisodes(
  seriesId: number,
  seriesTitle: string,
  nextEpisodeId: { value: number },
  nextEpisodeFileId: { value: number },
): {
  episodes: MockEpisode[]
  episodeFiles: MockEpisodeFile[]
  seasons: MockSeason[]
  statistics: MockSeriesStatistics
} {
  const episodes: MockEpisode[] = []
  const episodeFiles: MockEpisodeFile[] = []

  for (let ep = 1; ep <= EPISODES_PER_SEASON; ep++) {
    const hasFile = ep <= EPISODES_WITH_FILES
    let episodeFileId = 0
    if (hasFile) {
      episodeFileId = nextEpisodeFileId.value++
      episodeFiles.push({
        id: episodeFileId,
        seriesId,
        seasonNumber: 1,
        relativePath: `Season 01/${seriesTitle} - S01E${String(ep).padStart(2, '0')}.mkv`,
        path: `/data/media/${seriesTitle}/Season 01/${seriesTitle} - S01E${String(ep).padStart(2, '0')}.mkv`,
        size: 1_500_000_000,
      })
    }

    episodes.push({
      id: nextEpisodeId.value++,
      seriesId,
      episodeFileId,
      seasonNumber: 1,
      episodeNumber: ep,
      title: `Episode ${ep}`,
      hasFile,
      monitored: true,
      unverifiedSceneNumbering: false,
      grabbed: false,
    })
  }

  const aggregates = recomputeSeriesAggregates(episodes, episodeFiles)
  return {
    episodes,
    episodeFiles,
    seasons: aggregates.seasons,
    statistics: aggregates.statistics,
  }
}

/**
 * Rebuild series/season statistics from the current episode + episode-file
 * state so deletes stay consistent with subsequent series reads.
 */
export function recomputeSeriesAggregates(
  seriesEpisodes: MockEpisode[],
  seriesEpisodeFiles: MockEpisodeFile[],
): {
  seasons: MockSeason[]
  statistics: MockSeriesStatistics
} {
  const seasonNumbers = new Set<number>([0])
  for (const episode of seriesEpisodes) {
    seasonNumbers.add(episode.seasonNumber)
  }

  const seasons = [...seasonNumbers]
    .sort((a, b) => a - b)
    .map((seasonNumber) => {
      const seasonEps = seriesEpisodes.filter(
        (ep) => ep.seasonNumber === seasonNumber,
      )
      const episodeFileCount = seasonEps.filter((ep) => ep.hasFile).length
      const totalEpisodeCount = seasonEps.length
      const sizeOnDisk = seriesEpisodeFiles
        .filter((file) => file.seasonNumber === seasonNumber)
        .reduce((sum, file) => sum + file.size, 0)

      return {
        seasonNumber,
        monitored: seasonNumber > 0,
        statistics: {
          episodeFileCount,
          episodeCount: totalEpisodeCount,
          totalEpisodeCount,
          sizeOnDisk,
          releaseGroups: [],
          percentOfEpisodes:
            totalEpisodeCount === 0
              ? 0
              : (episodeFileCount / totalEpisodeCount) * 100,
        },
      }
    })

  const episodeFileCount = seriesEpisodes.filter((ep) => ep.hasFile).length
  const totalEpisodeCount = seriesEpisodes.length
  const sizeOnDisk = seriesEpisodeFiles.reduce(
    (sum, file) => sum + file.size,
    0,
  )
  const seasonCount = seasons.filter((season) => season.seasonNumber > 0).length

  return {
    seasons,
    statistics: {
      seasonCount,
      episodeFileCount,
      episodeCount: totalEpisodeCount,
      totalEpisodeCount,
      sizeOnDisk,
      releaseGroups: [],
      percentOfEpisodes:
        totalEpisodeCount === 0
          ? 0
          : (episodeFileCount / totalEpisodeCount) * 100,
    },
  }
}

type AssertAssignable<T, _U extends T> = never
type _EpisodeContract = AssertAssignable<SonarrEpisode, MockEpisode>
type _SeasonContract = AssertAssignable<SonarrSeason[], MockSeason[]>
type _SeriesStatsContract = AssertAssignable<
  NonNullable<SonarrSeries['statistics']>,
  MockSeriesStatistics
>
type _LookupContract = AssertAssignable<
  RadarrMovieLookupResponse,
  ReturnType<typeof createRadarrTmdbLookup>
>
type _SeriesLookupContract = AssertAssignable<
  SonarrSeriesLookupResponse,
  ReturnType<typeof createSonarrTvdbLookup>
>
