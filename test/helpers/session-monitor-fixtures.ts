/**
 * Shared fixtures for session monitoring tests. The canonical test show is
 * "Stella" (Sonarr series 1566, tvdb 90210) watched by nicole3876 unless a
 * test overrides the viewer.
 */

import type { Config } from '@root/types/config.types.js'
import type { PlexSession } from '@root/types/plex-session.types.js'
import type { SonarrEpisode, SonarrSeries } from '@root/types/sonarr.types.js'
import type { Mock } from 'vitest'
import { vi } from 'vitest'

export function sessionMonitoringConfig(
  overrides: Partial<NonNullable<Config['plexSessionMonitoring']>> = {},
): NonNullable<Config['plexSessionMonitoring']> {
  return {
    enabled: true,
    filterUsers: [],
    enableAutoReset: false,
    remainingEpisodes: 2,
    inactivityResetDays: 7,
    autoResetIntervalHours: 24,
    pollingIntervalMinutes: 15,
    enableProgressiveCleanup: true,
    ...overrides,
  }
}

export interface FakeSonarrService {
  getSeriesById: Mock
  getEpisodes: Mock
  updateSeasonMonitoring: Mock
  updateEpisodesMonitoring: Mock
  deleteEpisodeFiles: Mock
  searchSeason: Mock
}

// Pass named spies via overrides when a test asserts on them
export function makeFakeSonarr(
  overrides: Partial<FakeSonarrService> = {},
): FakeSonarrService {
  return {
    getSeriesById: vi.fn().mockResolvedValue(makeSonarrSeries(1566, 5)),
    getEpisodes: vi.fn().mockResolvedValue([]),
    updateSeasonMonitoring: vi.fn().mockResolvedValue(true),
    updateEpisodesMonitoring: vi.fn().mockResolvedValue(true),
    deleteEpisodeFiles: vi.fn().mockResolvedValue(true),
    searchSeason: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
}

export function makeEpisodeSession({
  season,
  episode,
  userId = 'u_nicole',
  username = 'nicole3876',
  userThumb,
}: {
  season: number
  episode: number
  userId?: string
  username?: string
  userThumb?: string
}): PlexSession {
  return {
    type: 'episode',
    sessionKey: 'sess-nicole',
    ratingKey: '106942',
    key: '/library/metadata/106942',
    guid: 'plex://episode/abc',
    title: 'Episode',
    parentRatingKey: '106941',
    parentKey: '/library/metadata/106941',
    parentIndex: season,
    parentTitle: `Season ${season}`,
    parentGuid: 'plex://season/abc',
    grandparentRatingKey: '106940',
    grandparentKey: '/library/metadata/106940',
    grandparentTitle: 'Stella',
    grandparentGuid: 'plex://show/abc',
    index: episode,
    viewOffset: 0,
    duration: 1_200_000,
    User: { id: userId, title: username, thumb: userThumb },
    Session: { id: 'session', bandwidth: 0, location: 'lan' },
    librarySectionTitle: 'TV Shows',
    librarySectionID: '2',
  }
}

export function makeShowMetadata(tvdbId: string) {
  return {
    MediaContainer: {
      Metadata: [
        {
          ratingKey: '106940',
          guid: 'plex://show/abc',
          Guid: [{ id: `tvdb://${tvdbId}` }, { id: 'imdb://tt12345' }],
        },
      ],
    },
  }
}

export function makeSonarrSeries(
  seriesId: number,
  totalSeasons: number,
): SonarrSeries {
  const seasons = []
  for (let n = 1; n <= totalSeasons; n++) {
    seasons.push({
      seasonNumber: n,
      monitored: true,
      statistics: { totalEpisodeCount: 16 },
    })
  }
  return {
    title: 'Stella',
    tvdbId: 90210,
    id: seriesId,
    seasons,
  } as unknown as SonarrSeries
}

// Season 1 fully monitored with files, season 2 present but unmonitored - the
// state that lets expandMonitoringToNextSeason fire (it skips when the next
// season has no unmonitored episodes).
export function makeEpisodesSeason2Unmonitored(
  seriesId: number,
): SonarrEpisode[] {
  const episodes: SonarrEpisode[] = []
  for (let n = 1; n <= 16; n++) {
    episodes.push({
      id: 100 + n,
      seriesId,
      episodeFileId: 1000 + n,
      seasonNumber: 1,
      episodeNumber: n,
      title: `S1E${n}`,
      hasFile: true,
      monitored: true,
      unverifiedSceneNumbering: false,
      grabbed: false,
    })
  }
  for (let n = 1; n <= 16; n++) {
    episodes.push({
      id: 200 + n,
      seriesId,
      episodeFileId: 0,
      seasonNumber: 2,
      episodeNumber: n,
      title: `S2E${n}`,
      hasFile: false,
      monitored: false,
      unverifiedSceneNumbering: false,
      grabbed: false,
    })
  }
  return episodes
}

// Builds episodes for the given seasons with files. Episode IDs are
// seasonNumber*100 + episodeNumber (e.g. S2E3 = 203). File IDs are
// seasonNumber*1000 + episodeNumber (e.g. S2E3 = 2003). E01 of each
// season is the pilot, E02-E10 are the rest.
export function makeEpisodesWithFiles(
  seasons: number[],
  seriesId: number,
): SonarrEpisode[] {
  const episodes: SonarrEpisode[] = []
  for (const seasonNumber of seasons) {
    for (let n = 1; n <= 10; n++) {
      episodes.push({
        id: seasonNumber * 100 + n,
        seriesId,
        episodeFileId: seasonNumber * 1000 + n,
        seasonNumber,
        episodeNumber: n,
        title: `S${seasonNumber}E${n}`,
        hasFile: true,
        monitored: true,
        unverifiedSceneNumbering: false,
        grabbed: false,
      })
    }
  }
  return episodes
}
