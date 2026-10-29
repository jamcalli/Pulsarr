import { placeholderRadarrInstance } from '@root/schemas/common/arr-placeholder.js'
import type {
  RadarrInstance,
  Item as RadarrItem,
} from '@root/types/radarr.types.js'
import type {
  AppliedRadarrRouting,
  RadarrRouteSettings,
} from '@root/types/router.types.js'
import type { ExistenceCheckResult } from '@root/types/service-result.types.js'
import {
  type ArrInstanceStore,
  ArrManager,
  type ArrRoute,
  type ArrRouted,
} from '@services/arr/arr-manager.js'
import { RADARR } from '@services/arr/arr-product.js'
import { RadarrService } from '@services/radarr.service.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

export class RadarrManagerService extends ArrManager<
  RadarrInstance,
  RadarrService,
  RadarrItem,
  RadarrRouteSettings,
  AppliedRadarrRouting
> {
  protected readonly store: ArrInstanceStore<RadarrInstance> = {
    all: () => this.fastify.db.getAllRadarrInstances(),
    getDefault: () => this.fastify.db.getDefaultRadarrInstance(),
    get: (id) => this.fastify.db.getRadarrInstance(id),
    create: (instance) => this.fastify.db.createRadarrInstance(instance),
    update: (id, updates) => this.fastify.db.updateRadarrInstance(id, updates),
    delete: (id) => this.fastify.db.deleteRadarrInstance(id),
    replace: (id, replacement) =>
      this.fastify.db.replaceRadarrInstance(id, replacement),
  }

  constructor(baseLog: FastifyBaseLogger, fastify: FastifyInstance) {
    super(RADARR, baseLog, fastify)
  }

  protected createService(appBaseUrl: string, port: number): RadarrService {
    return new RadarrService(this.baseLog, appBaseUrl, port, this.fastify)
  }

  protected placeholder(): Omit<RadarrInstance, 'id'> {
    return placeholderRadarrInstance()
  }

  protected withId(
    row: Omit<RadarrInstance, 'id'>,
    id: number,
  ): RadarrInstance {
    return { ...row, id }
  }

  protected async fetchInstanceItems(
    service: RadarrService,
    instanceId: number,
    bypassExclusions: boolean,
  ): Promise<RadarrItem[]> {
    const movies = await service.fetchMovies(bypassExclusions)
    return [...movies].map((m) => ({ ...m, radarr_instance_id: instanceId }))
  }

  protected itemExists(
    service: RadarrService,
    tmdbId: number,
  ): Promise<ExistenceCheckResult> {
    return service.movieExistsByTmdbId(tmdbId)
  }

  protected isItemExcluded(
    service: RadarrService,
    tmdbId: number,
  ): Promise<boolean> {
    return service.isTmdbIdExcluded(tmdbId)
  }

  protected async addRouted(
    route: ArrRoute<
      RadarrInstance,
      RadarrService,
      RadarrItem,
      RadarrRouteSettings
    >,
  ): Promise<ArrRouted<AppliedRadarrRouting>> {
    const { instance, settings } = route
    const minimumAvailability =
      settings.minimumAvailability ?? instance.minimumAvailability ?? 'released'
    const monitor = settings.monitor ?? instance.monitor ?? 'movieOnly'

    const added = await route.service.addToRadarr(
      route.item,
      route.rootFolder,
      route.qualityProfileId,
      route.tags,
      route.searchOnAdd,
      minimumAvailability,
      monitor,
    )

    return {
      watchlist: { radarr_instance_id: route.instanceId },
      applied: {
        ...this.appliedRouting(route, added),
        instanceType: 'radarr',
        minimumAvailability,
        monitor,
      },
    }
  }

  fetchAllMovies(bypassExclusions?: boolean): Promise<RadarrItem[]> {
    return this.fetchAllItems(bypassExclusions)
  }

  routeItemToRadarr(
    item: RadarrItem,
    key: string,
    userId: number,
    instanceId?: number,
    syncing = false,
    settings: RadarrRouteSettings = {},
  ): Promise<AppliedRadarrRouting> {
    return this.routeItem(item, key, userId, instanceId, syncing, settings)
  }

  movieExistsByTmdbId(
    instanceId: number,
    tmdbId: number,
  ): Promise<ExistenceCheckResult> {
    return this.itemExistsById(instanceId, tmdbId)
  }

  getRadarrInstance(id: number): Promise<RadarrInstance | null> {
    return this.getInstance(id)
  }

  getRadarrService(id: number): RadarrService | undefined {
    return this.getService(id)
  }
}
