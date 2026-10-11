import type { RadarrItem } from '@root/types/radarr.types.js'
import type { SonarrItem } from '@root/types/sonarr.types.js'
import type { DatabaseService } from '@services/database.service.js'
import type { RadarrService } from '@services/radarr.service.js'
import type { SonarrService } from '@services/sonarr.service.js'
import { extractRadarrId, extractSonarrId } from '@utils/guid-handler.js'
import {
  ARR_META,
  type ArrAdapter,
  type ArrInstanceRef,
  type ArrType,
  type LibraryItem,
  type UserTagDeps,
  type WatchlistGuidItem,
} from './types.js'

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
    extractItemId: extractRadarrId,
    usersWithItems: () => db.getUsersWithRadarrItems(instance.id),
  }
}

export interface ArrInstance {
  instance: ArrInstanceRef
  /** Undefined when the manager has the instance but no initialized service. */
  adapter: ArrAdapter | undefined
}

export async function listInstances(
  type: ArrType,
  deps: UserTagDeps,
): Promise<ArrInstance[]> {
  if (type === 'sonarr') {
    const manager = deps.sonarrManager
    return (await manager.getAllInstances()).map((instance) => {
      const service = manager.getSonarrService(instance.id)
      return {
        instance,
        adapter: service && sonarrAdapter(instance, service, deps.db),
      }
    })
  }
  const manager = deps.radarrManager
  return (await manager.getAllInstances()).map((instance) => {
    const service = manager.getRadarrService(instance.id)
    return {
      instance,
      adapter: service && radarrAdapter(instance, service, deps.db),
    }
  })
}

export interface ArrAdapters {
  adapters: ArrAdapter[]
  /** Counts every configured instance, including those without a live service. */
  instanceCount: number
}

/** Warns with the `skipping` suffix for each instance without a live service; omit it to drop them silently. */
export async function getAdapters(
  type: ArrType,
  deps: UserTagDeps,
  skipping?: string,
): Promise<ArrAdapters> {
  const instances = await listInstances(type, deps)
  const adapters: ArrAdapter[] = []
  for (const { instance, adapter } of instances) {
    if (adapter) {
      adapters.push(adapter)
    } else if (skipping) {
      deps.logger.warn(
        `${ARR_META[type].displayName} service for instance ${instance.name} not found, ${skipping}`,
      )
    }
  }
  return { adapters, instanceCount: instances.length }
}

export async function fetchLibrary(
  type: ArrType,
  deps: UserTagDeps,
): Promise<LibraryItem[]> {
  return type === 'sonarr'
    ? sonarrLibraryItems(await deps.sonarrManager.fetchAllSeries(true))
    : radarrLibraryItems(await deps.radarrManager.fetchAllMovies(true))
}

export function watchlistItemsForType(
  type: ArrType,
  deps: UserTagDeps,
): Promise<WatchlistGuidItem[]> {
  return type === 'sonarr'
    ? deps.db.getAllShowWatchlistItems()
    : deps.db.getAllMovieWatchlistItems()
}
