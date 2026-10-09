import type { Config } from '@root/types/config.types.js'
import type { RoutingDetails } from '@root/types/router.types.js'
import type { RoutingFailureInput } from '@root/types/routing-failure.types.js'
import type { ApprovalService } from '@services/approval.service.js'
import type { DatabaseService } from '@services/database.service.js'
import type { NotificationService } from '@services/notification.service.js'
import type { ProgressService } from '@services/progress.service.js'
import type { QuotaService } from '@services/quota.service.js'
import type { RadarrManagerService } from '@services/radarr-manager.service.js'
import type { SonarrManagerService } from '@services/sonarr-manager.service.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type { RuleCache } from './rule-cache.js'

export interface ContentRouterDeps {
  logger: FastifyBaseLogger
  config: Config
  db: DatabaseService
  fastify: FastifyInstance
  rules: RuleCache
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
  syncing?: boolean
  syncTargetInstanceId?: number
}

export interface RoutingOutcome {
  routedInstances: number[]
  routingDetails: RoutingDetails[]
  /** Instances whose add failed, present only when at least one did. */
  failures?: RoutingFailureInput[]
}

export type GateOutcome =
  | { action: 'handled'; result: RoutingOutcome }
  | { action: 'blocked' }
  | { action: 'proceed' }

export function notRouted(): RoutingOutcome {
  return { routedInstances: [], routingDetails: [] }
}

/** Attaches failures only when there are any, so a clean outcome keeps its shape. */
export function withFailures(
  outcome: RoutingOutcome,
  failures: RoutingFailureInput[],
): RoutingOutcome {
  return failures.length > 0 ? { ...outcome, failures } : outcome
}
