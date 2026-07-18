/**
 * Shared fixture data for local Radarr / Sonarr mock servers.
 */

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
  },
]

export const rootFolders = [
  {
    id: 1,
    path: '/data/media',
    accessible: true,
    freeSpace: 1_000_000_000_000,
    unmappedFolders: [],
  },
]

export const defaultTags = [{ id: 1, label: 'pulsarr' }]

export function emptyPagedResult() {
  return {
    page: 1,
    pageSize: 1000,
    sortKey: 'id',
    sortDirection: 'ascending',
    totalRecords: 0,
    records: [],
  }
}

/** Apply Servarr bulk-editor tag semantics to an existing tag list. */
export function applyTags(
  current: number[],
  tags: number[],
  mode: 'add' | 'remove' | 'replace' = 'replace',
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
  seasons: unknown[]
  statistics: Record<string, number>
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

  const seasons = [
    {
      seasonNumber: 0,
      monitored: false,
      statistics: {
        episodeFileCount: 0,
        episodeCount: 0,
        totalEpisodeCount: 0,
        sizeOnDisk: 0,
        percentOfEpisodes: 0,
      },
    },
    {
      seasonNumber: 1,
      monitored: true,
      statistics: {
        episodeFileCount: EPISODES_WITH_FILES,
        episodeCount: EPISODES_PER_SEASON,
        totalEpisodeCount: EPISODES_PER_SEASON,
        sizeOnDisk: EPISODES_WITH_FILES * 1_500_000_000,
        percentOfEpisodes: (EPISODES_WITH_FILES / EPISODES_PER_SEASON) * 100,
      },
    },
  ]

  const statistics = {
    seasonCount: 1,
    episodeFileCount: EPISODES_WITH_FILES,
    episodeCount: EPISODES_PER_SEASON,
    totalEpisodeCount: EPISODES_PER_SEASON,
    sizeOnDisk: EPISODES_WITH_FILES * 1_500_000_000,
    percentOfEpisodes: (EPISODES_WITH_FILES / EPISODES_PER_SEASON) * 100,
  }

  return { episodes, episodeFiles, seasons, statistics }
}
