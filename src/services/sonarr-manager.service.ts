import { placeholderSonarrInstance } from '@root/schemas/common/arr-placeholder.js'
import {
  isRollingMonitoringOption,
  type SonarrRollingMonitorOption,
} from '@root/schemas/sonarr/season-monitoring.schema.js'
import type {
  AppliedSonarrRouting,
  SonarrRouteSettings,
} from '@root/types/router.types.js'
import type { ExistenceCheckResult } from '@root/types/service-result.types.js'
import type {
  SonarrInstance,
  SonarrItem,
  SonarrSeries,
} from '@root/types/sonarr.types.js'
import {
  type ArrInstanceStore,
  ArrManager,
  type ArrPreparedItem,
  type ArrRoute,
  type ArrRouted,
} from '@services/arr/arr-manager.js'
import { SONARR } from '@services/arr/arr-product.js'
import { SonarrService } from '@services/sonarr.service.js'
import { extractTvdbId } from '@utils/guid-handler.js'
import {
  InvalidSeasonMonitoringError,
  rejectedSeasonMonitoring,
} from '@utils/season-monitoring.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

type SonarrRoute = ArrRoute<
  SonarrInstance,
  SonarrService,
  SonarrItem,
  SonarrRouteSettings
>

/** The Sonarr monitor option a rolling show is added with before enrollment widens it. */
const ROLLING_ADD_MONITOR: Record<SonarrRollingMonitorOption, string> = {
  pilotRolling: 'pilot',
  firstSeasonRolling: 'firstSeason',
  allSeasonPilotRolling: 'none',
}

export class SonarrManagerService extends ArrManager<
  SonarrInstance,
  SonarrSeries,
  SonarrService,
  SonarrItem,
  SonarrRouteSettings,
  AppliedSonarrRouting
> {
  protected readonly store: ArrInstanceStore<SonarrInstance> = {
    all: () => this.fastify.db.getAllSonarrInstances(),
    getDefault: () => this.fastify.db.getDefaultSonarrInstance(),
    get: (id) => this.fastify.db.getSonarrInstance(id),
    create: (instance) => this.fastify.db.createSonarrInstance(instance),
    update: (id, updates) => this.fastify.db.updateSonarrInstance(id, updates),
    delete: (id) => this.fastify.db.deleteSonarrInstance(id),
    replace: (id, replacement) =>
      this.fastify.db.replaceSonarrInstance(id, replacement),
  }

  constructor(baseLog: FastifyBaseLogger, fastify: FastifyInstance) {
    super(SONARR, baseLog, fastify)
  }

  protected createService(appBaseUrl: string, port: number): SonarrService {
    return new SonarrService(
      this.baseLog,
      appBaseUrl,
      port,
      this.fastify,
      this.caches,
    )
  }

  protected placeholder(): Omit<SonarrInstance, 'id'> {
    return placeholderSonarrInstance()
  }

  protected withId(
    row: Omit<SonarrInstance, 'id'>,
    id: number,
  ): SonarrInstance {
    return { ...row, id }
  }

  protected async fetchInstanceItems(
    service: SonarrService,
    instanceId: number,
    bypassExclusions: boolean,
  ): Promise<SonarrItem[]> {
    const series = await service.fetchSeries(bypassExclusions)
    return [...series].map((s) => ({ ...s, sonarr_instance_id: instanceId }))
  }

  protected isItemExcluded(
    service: SonarrService,
    tvdbId: number,
  ): Promise<boolean> {
    return service.isTvdbIdExcluded(tvdbId)
  }

  protected validateInstance(
    next: Partial<Omit<SonarrInstance, 'id'>>,
    current: SonarrInstance | null,
  ): void {
    const rejected = rejectedSeasonMonitoring(
      next.seasonMonitoring,
      current ? [current.seasonMonitoring] : [],
    )
    if (rejected !== undefined) throw new InvalidSeasonMonitoringError(rejected)
  }

  protected async addRouted(
    route: SonarrRoute,
  ): Promise<ArrRouted<AppliedSonarrRouting>> {
    const { instance, instanceId, item, settings } = route
    const seasonMonitoring =
      settings.seasonMonitoring ?? instance.seasonMonitoring ?? 'all'
    const seriesType = settings.seriesType ?? instance.seriesType ?? 'standard'

    const rolling = isRollingMonitoringOption(seasonMonitoring)

    const added = await route.service.addToSonarr(
      item,
      route.rootFolder,
      route.qualityProfileId,
      route.tags,
      route.searchOnAdd,
      rolling ? ROLLING_ADD_MONITOR[seasonMonitoring] : seasonMonitoring,
      seriesType,
    )
    if (rolling) {
      await this.enrollRolling(
        added.seriesId,
        instanceId,
        item,
        seasonMonitoring,
      )
    }

    return {
      watchlist: {
        sonarr_instance_id: instanceId,
        sonarr_series_id: added.seriesId,
      },
      applied: {
        ...this.appliedRouting(route, added),
        instanceType: 'sonarr',
        seasonMonitoring,
        seriesType,
      },
    }
  }

  /** Never throws, so a failed enrollment leaves the add itself standing. */
  private async enrollRolling(
    seriesId: number,
    instanceId: number,
    item: ArrPreparedItem<SonarrItem>,
    monitoring: SonarrRollingMonitorOption,
  ): Promise<void> {
    const plexSessionMonitor = this.fastify.plexSessionMonitor
    if (!plexSessionMonitor) return
    try {
      const tvdbId = extractTvdbId(item.guids)
      await plexSessionMonitor.createRollingMonitoredShow(
        seriesId,
        instanceId,
        tvdbId ? String(tvdbId) : '',
        item.title,
        monitoring,
      )
      if (monitoring === 'allSeasonPilotRolling') {
        await plexSessionMonitor.monitorAllSeasonPilots(seriesId, instanceId)
      }
      this.log.debug(
        { seriesId, instanceId, tvdbId: tvdbId || null, monitoring },
        'Created rolling monitoring entry',
      )
    } catch (error) {
      this.log.error({ error }, 'Failed to create rolling monitoring entry')
    }
  }

  fetchAllSeries(bypassExclusions?: boolean): Promise<SonarrItem[]> {
    return this.fetchAllItems(bypassExclusions)
  }

  routeItemToSonarr(
    item: SonarrItem,
    key: string,
    userId: number,
    instanceId?: number,
    syncing = false,
    settings: SonarrRouteSettings = {},
  ): Promise<AppliedSonarrRouting> {
    return this.routeItem(item, key, userId, instanceId, syncing, settings)
  }

  seriesExistsByTvdbId(
    instanceId: number,
    tvdbId: number,
  ): Promise<ExistenceCheckResult> {
    return this.itemExistsById(instanceId, tvdbId)
  }

  getSonarrInstance(id: number): Promise<SonarrInstance | null> {
    return this.getInstance(id)
  }

  getSonarrService(id: number): SonarrService | undefined {
    return this.getService(id)
  }

  /** Null when the instance has no service. */
  async getSeasonEpisodeCount(
    instanceId: number,
    seriesId: number,
    seasonNumber: number,
  ): Promise<number | null> {
    const service = this.services.get(instanceId)
    if (!service) {
      this.log.warn(
        { instanceId, seriesId, seasonNumber },
        'Sonarr instance not found for episode count lookup',
      )
      return null
    }
    return service.getSeasonEpisodeCount(seriesId, seasonNumber)
  }
}
