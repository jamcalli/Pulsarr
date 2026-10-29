import type { Config } from '@root/types/config.types.js'
import type {
  AppliedRadarrRouting,
  AppliedSonarrRouting,
  RouterRule,
  RoutingDetails,
} from '@root/types/router.types.js'
import type { ApprovalService } from '@services/approval.service.js'
import type { DatabaseService } from '@services/database.service.js'
import type { NotificationService } from '@services/notification.service.js'
import type { ProgressService } from '@services/progress.service.js'
import type { QuotaService } from '@services/quota.service.js'
import type { RadarrManagerService } from '@services/radarr-manager.service.js'
import type { SonarrManagerService } from '@services/sonarr-manager.service.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type { UserListCache } from './user-list-cache.js'

export interface ContentRouterDeps {
  logger: FastifyBaseLogger
  config: Config
  db: DatabaseService
  fastify: FastifyInstance
  rules: { get(): Promise<RouterRule[]> }
  userLists: UserListCache
  radarrManager: RadarrManagerService
  sonarrManager: SonarrManagerService
  approvalService: ApprovalService
  quotaService: QuotaService
  notifications: NotificationService
  progress: ProgressService
}

export interface RouteContentOptions {
  userId: number
  userName?: string
  userAlias?: string | null
  syncing?: boolean
  syncTargetInstanceId?: number
  syncSourceInstanceId?: number
  /** Set by the full reconciliation pass, which revisits items already decided. */
  reconcile?: boolean
}

export interface RoutingOutcome {
  routedInstances: number[]
  routingDetails: RoutingDetails[]
}

interface AppliedSettingsBase {
  qualityProfile: string | undefined
  rootFolder: string | undefined
  tags: string[]
  searchOnAdd: boolean
}

export interface AppliedMovieSettings extends AppliedSettingsBase {
  minimumAvailability: AppliedRadarrRouting['minimumAvailability']
  monitor: AppliedRadarrRouting['monitor']
}

export interface AppliedShowSettings extends AppliedSettingsBase {
  seasonMonitoring: AppliedSonarrRouting['seasonMonitoring']
  seriesType: AppliedSonarrRouting['seriesType']
}

/** One level deep so the log viewer flattens it into rows. */
export type AppliedSettings = AppliedMovieSettings | AppliedShowSettings

export type GateOutcome =
  | { action: 'handled'; result: RoutingOutcome }
  | { action: 'blocked' }
  | { action: 'proceed' }

export function notRouted(): RoutingOutcome {
  return { routedInstances: [], routingDetails: [] }
}
