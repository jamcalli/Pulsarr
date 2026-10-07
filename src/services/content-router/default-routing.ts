import type {
  ContentItem,
  RoutingDecision,
  RoutingDetails,
  TargetInstancesResult,
} from '@root/types/router.types.js'
import type { DatabaseService } from '@services/database.service.js'
import { parseQualityProfileId } from '@utils/quality-profile.js'
import type { FastifyBaseLogger } from 'fastify'
import { routeToArr } from './routing-capture.js'
import type { ContentRouterDeps } from './types.js'

const INSTANCE_SOURCE = {
  movie: {
    getDefault: 'getDefaultRadarrInstance',
    getAll: 'getAllRadarrInstances',
    label: 'Radarr',
  },
  show: {
    getDefault: 'getDefaultSonarrInstance',
    getAll: 'getAllSonarrInstances',
    label: 'Sonarr',
  },
} as const

function parseSyncedInstances(
  syncedInstances: number[] | string | null | undefined,
  log: FastifyBaseLogger,
): number[] {
  if (Array.isArray(syncedInstances)) {
    return syncedInstances
  }
  if (typeof syncedInstances === 'string') {
    try {
      return JSON.parse(syncedInstances || '[]')
    } catch (e) {
      log.error(
        { error: e },
        `Invalid syncedInstances JSON: "${syncedInstances}"`,
      )
      return []
    }
  }
  return []
}

function validateSyncedInstances(
  syncedIds: number[],
  allInstances: { id: number }[],
  existingIds: number[],
  log: FastifyBaseLogger,
): number[] {
  const instanceMap = new Map(
    allInstances.map((instance) => [instance.id, instance]),
  )
  const validIds: number[] = []

  for (const rawId of syncedIds) {
    const syncedId = Number(rawId)
    if (Number.isNaN(syncedId)) {
      log.warn(`Invalid synced instance ID "${rawId}", skipping`)
      continue
    }

    if (existingIds.includes(syncedId)) continue

    const instance = instanceMap.get(syncedId)
    if (!instance) {
      log.warn(`Synced instance ${syncedId} not found, skipping`)
      continue
    }

    validIds.push(syncedId)
  }

  return validIds
}

export async function getDefaultInstanceIds(
  contentType: 'movie' | 'show',
  deps: Pick<ContentRouterDeps, 'logger' | 'db'>,
): Promise<TargetInstancesResult> {
  const { logger, db } = deps
  const source = INSTANCE_SOURCE[contentType]
  const instanceIds: number[] = []

  const defaultInstance = await db[source.getDefault]()
  if (!defaultInstance) {
    logger.warn(`No default ${source.label} instance found`)
    return { instanceIds: [] }
  }

  if (defaultInstance.skipDefaultRoutingWhenNoMatch) {
    logger.debug(
      `Default routing disabled on default ${source.label} instance "${defaultInstance.name}", skipping ${contentType} with no matching router rule`,
    )
    return { instanceIds: [], skipReason: 'default-skip' }
  }

  instanceIds.push(defaultInstance.id)
  const syncedIds = parseSyncedInstances(
    defaultInstance.syncedInstances,
    logger,
  )

  if (syncedIds.length > 0) {
    const allInstances = await db[source.getAll]()
    const validSyncedIds = validateSyncedInstances(
      syncedIds,
      allInstances,
      instanceIds,
      logger,
    )
    instanceIds.push(...validSyncedIds)
  }

  return { instanceIds }
}

interface DecisionSource {
  id: number
  qualityProfile?: string | number | null
  rootFolder?: string | null
  tags?: string[]
  searchOnAdd?: boolean
  typeFields: Pick<
    RoutingDecision,
    'minimumAvailability' | 'monitor' | 'seasonMonitoring' | 'seriesType'
  >
}

async function readDecisionSources(
  contentType: 'movie' | 'show',
  db: DatabaseService,
): Promise<DecisionSource[]> {
  if (contentType === 'movie') {
    const instances = await db.getAllRadarrInstances()
    return instances.map((instance) => ({
      ...instance,
      typeFields: {
        minimumAvailability: instance.minimumAvailability || 'released',
        monitor: instance.monitor || 'movieOnly',
      },
    }))
  }
  const instances = await db.getAllSonarrInstances()
  return instances.map((instance) => ({
    ...instance,
    typeFields: {
      seasonMonitoring: instance.seasonMonitoring || 'all',
      seriesType: instance.seriesType || 'standard',
    },
  }))
}

/** Snapshots each default instance's settings, which a pending approval stores. */
export async function getDefaultRoutingDecisions(
  contentType: 'movie' | 'show',
  deps: Pick<ContentRouterDeps, 'logger' | 'db'>,
): Promise<RoutingDecision[]> {
  const { instanceIds } = await getDefaultInstanceIds(contentType, deps)
  if (instanceIds.length === 0) {
    return []
  }

  const sources = await readDecisionSources(contentType, deps.db)
  const byId = new Map(sources.map((source) => [source.id, source]))

  return instanceIds.flatMap((instanceId) => {
    const source = byId.get(instanceId)
    if (!source) return []
    return [
      {
        instanceId,
        qualityProfile:
          parseQualityProfileId(source.qualityProfile)?.toString() || null,
        rootFolder: source.rootFolder || null,
        tags: source.tags || [],
        priority: 50,
        searchOnAdd: source.searchOnAdd ?? true,
        ...source.typeFields,
      },
    ]
  })
}

/** Returns what each instance applied, skipping an instance whose add fails. */
export async function routeUsingDefault(
  item: ContentItem,
  key: string,
  userId: number,
  syncing: boolean | undefined,
  deps: Pick<
    ContentRouterDeps,
    'logger' | 'db' | 'radarrManager' | 'sonarrManager'
  >,
): Promise<RoutingDetails[]> {
  const { instanceIds } = await getDefaultInstanceIds(item.type, deps)
  const routings: RoutingDetails[] = []

  for (const instanceId of instanceIds) {
    try {
      routings.push(
        await routeToArr(
          { item, key, userId, instanceId, syncing: syncing ?? false },
          {},
          deps,
        ),
      )
    } catch (error) {
      deps.logger.error(
        { error },
        `Error routing "${item.title}" to ${INSTANCE_SOURCE[item.type].label} instance ${instanceId}`,
      )
    }
  }

  return routings
}
