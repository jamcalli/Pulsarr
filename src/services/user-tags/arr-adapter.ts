import type { RadarrItem, RadarrMovie } from '@root/types/radarr.types.js'
import type { SonarrItem, SonarrSeries } from '@root/types/sonarr.types.js'
import type { DatabaseService } from '@services/database.service.js'
import type { RadarrService } from '@services/radarr.service.js'
import type { RadarrManagerService } from '@services/radarr-manager.service.js'
import type { SonarrService } from '@services/sonarr.service.js'
import type { SonarrManagerService } from '@services/sonarr-manager.service.js'
import {
  extractRadarrId,
  extractSonarrId,
  normalizeGuid,
} from '@utils/guid-handler.js'
import type {
  ArrAdapter,
  ArrInstanceRef,
  ArrLibraryItem,
  ArrSource,
  ArrType,
  LibraryItem,
  UserTagDeps,
} from './types.js'

function providerGuids(
  ids: Array<[provider: string, id: string | number | undefined]>,
): string[] {
  return ids
    .filter(([, id]) => Boolean(id))
    .map(([provider, id]) => normalizeGuid(`${provider}:${id}`))
}

function seriesToArrItem(series: SonarrSeries): ArrLibraryItem {
  return {
    id: series.id,
    guids: providerGuids([
      ['imdb', series.imdbId],
      ['tmdb', series.tmdbId],
      ['tvdb', series.tvdbId],
    ]),
    tags: series.tags ?? [],
  }
}

function movieToArrItem(movie: RadarrMovie): ArrLibraryItem {
  return {
    id: movie.id,
    guids: providerGuids([
      ['imdb', movie.imdbId],
      ['tmdb', movie.tmdbId],
    ]),
    tags: movie.tags ?? [],
  }
}

export function sonarrLibraryItems(series: SonarrItem[]): LibraryItem[] {
  return series.map((item) => ({
    instanceId: item.sonarr_instance_id,
    title: item.title,
    guids: item.guids,
    tags: item.tags,
    isExclusion: item.isExclusion === true,
  }))
}

export function radarrLibraryItems(movies: RadarrItem[]): LibraryItem[] {
  return movies.map((item) => ({
    instanceId: item.radarr_instance_id,
    title: item.title,
    guids: item.guids,
    tags: item.tags,
    isExclusion: item.isExclusion === true,
  }))
}

function sonarrAdapter(
  instance: ArrInstanceRef,
  service: SonarrService,
  db: DatabaseService,
): ArrAdapter {
  return {
    type: 'sonarr',
    instanceId: instance.id,
    name: instance.name,
    getTags: () => service.getTags(),
    getTagDetails: async () =>
      (await service.getTagDetails()).map((tag) => ({
        id: tag.id,
        label: tag.label,
        itemIds: tag.seriesIds,
      })),
    createTag: (label) => service.createTag(label),
    deleteTag: (id) => service.deleteTag(id),
    bulkUpdateTags: (updates, mode) =>
      service.bulkUpdateSeriesTags(
        updates.map((update) => ({
          seriesId: update.itemId,
          tagIds: update.tagIds,
        })),
        mode,
      ),
    getAllItems: async () =>
      (await service.getAllSeries()).map(seriesToArrItem),
    extractItemId: extractSonarrId,
    usersWithItems: () => db.getUsersWithSonarrItems(instance.id),
  }
}

function radarrAdapter(
  instance: ArrInstanceRef,
  service: RadarrService,
  db: DatabaseService,
): ArrAdapter {
  return {
    type: 'radarr',
    instanceId: instance.id,
    name: instance.name,
    getTags: () => service.getTags(),
    getTagDetails: async () =>
      (await service.getTagDetails()).map((tag) => ({
        id: tag.id,
        label: tag.label,
        itemIds: tag.movieIds,
      })),
    createTag: (label) => service.createTag(label),
    deleteTag: (id) => service.deleteTag(id),
    bulkUpdateTags: (updates, mode) =>
      service.bulkUpdateMovieTags(
        updates.map((update) => ({
          movieId: update.itemId,
          tagIds: update.tagIds,
        })),
        mode,
      ),
    getAllItems: async () => (await service.getAllMovies()).map(movieToArrItem),
    extractItemId: extractRadarrId,
    usersWithItems: () => db.getUsersWithRadarrItems(instance.id),
  }
}

function sonarrSource(
  manager: SonarrManagerService,
  db: DatabaseService,
): ArrSource {
  return {
    type: 'sonarr',
    displayName: 'Sonarr',
    itemNoun: 'series',
    getInstances: () => manager.getAllInstances(),
    getAdapter: (instance) => {
      const service = manager.getSonarrService(instance.id)
      return service ? sonarrAdapter(instance, service, db) : undefined
    },
    fetchLibrary: async () =>
      sonarrLibraryItems(await manager.fetchAllSeries(true)),
    watchlistItemsForType: () => db.getAllShowWatchlistItems(),
  }
}

function radarrSource(
  manager: RadarrManagerService,
  db: DatabaseService,
): ArrSource {
  return {
    type: 'radarr',
    displayName: 'Radarr',
    itemNoun: 'movies',
    getInstances: () => manager.getAllInstances(),
    getAdapter: (instance) => {
      const service = manager.getRadarrService(instance.id)
      return service ? radarrAdapter(instance, service, db) : undefined
    },
    fetchLibrary: async () =>
      radarrLibraryItems(await manager.fetchAllMovies(true)),
    watchlistItemsForType: () => db.getAllMovieWatchlistItems(),
  }
}

export function getArrSource(type: ArrType, deps: UserTagDeps): ArrSource {
  return type === 'sonarr'
    ? sonarrSource(deps.sonarrManager, deps.db)
    : radarrSource(deps.radarrManager, deps.db)
}
