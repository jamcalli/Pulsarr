import type { QuotaType } from '@root/types/approval.types.js'
import type { ContentItem, RoutingDetails } from '@root/types/router.types.js'
import { isArrAlreadyAddedError } from '@utils/arr-error.js'
import { errorMessage } from '@utils/error-message.js'
import { pluralize } from '@utils/pluralize.js'
import { recipientLabel } from '@utils/recipient-label.js'
import type { FastifyBaseLogger } from 'fastify'
import type { AppliedSettings, ContentRouterDeps } from './types.js'

export interface RoutingLog {
  logger: FastifyBaseLogger
  title: string
  guid: string | undefined
  userId: number
  user: string
  instanceNames: ReadonlyMap<number, string>
  /** Skips and holds log at debug. Failures and a missing instance are never gated. */
  reconcile: boolean
}

export interface RoutingLogSubject {
  logger: FastifyBaseLogger
  item: Pick<ContentItem, 'title' | 'guids'>
  userId: number
  userName?: string
  userAlias?: string | null
  instances: ReadonlyArray<{ id: number; name: string }>
  reconcile?: boolean
}

export type RoutingHold =
  | { reason: 'rule'; ruleId: number | undefined; ruleName: string | undefined }
  | { reason: 'user' }
  | {
      reason: 'quota'
      quotaType: QuotaType
      used: number
      limit: number
      weeklyRollingDays: number
    }

export type RoutingSkip =
  | { reason: 'present' | 'excluded'; instanceIds: number[] }
  | { reason: 'on-plex' | 'pending' | 'rejected' | 'no-instance' }
  | { reason: 'skip-rule'; ruleName: string }
  | {
      reason: 'routed-elsewhere'
      instanceId: number
      ruleInstanceIds: number[]
    }
  | { reason: 'no-rule-match'; instanceId: number }

export function createRoutingLog(subject: RoutingLogSubject): RoutingLog {
  return {
    logger: subject.logger,
    title: subject.item.title,
    guid: subject.item.guids[0],
    userId: subject.userId,
    user: subject.userName
      ? recipientLabel({ name: subject.userName, alias: subject.userAlias })
      : `user ${subject.userId}`,
    instanceNames: new Map(
      subject.instances.map((instance) => [instance.id, instance.name]),
    ),
    reconcile: subject.reconcile ?? false,
  }
}

/** Names are for log text only, so a failed lookup yields no names rather than failing the route. */
export function listRoutingInstances(
  contentType: ContentItem['type'],
  deps: Pick<ContentRouterDeps, 'radarrManager' | 'sonarrManager'>,
): Promise<ReadonlyArray<{ id: number; name: string }>> {
  const instances =
    contentType === 'movie'
      ? deps.radarrManager.getAllInstances()
      : deps.sonarrManager.getAllInstances()
  return instances.catch(() => [])
}

export type RoutingNames = Pick<RoutingLog, 'title' | 'user' | 'instanceNames'>

function lead(names: RoutingNames): string {
  return `"${names.title}" for ${names.user}`
}

function instanceName(names: RoutingNames, instanceId: number): string {
  return names.instanceNames.get(instanceId) ?? `instance ${instanceId}`
}

export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

function instanceList(names: RoutingNames, instanceIds: number[]): string {
  return joinNames(instanceIds.map((id) => instanceName(names, id)))
}

function quotaPeriod(type: QuotaType, weeklyRollingDays: number): string {
  switch (type) {
    case 'daily':
      return 'today'
    case 'weekly_rolling':
      return `in the last ${weeklyRollingDays} ${pluralize(weeklyRollingDays, 'day')}`
    case 'monthly':
      return 'this month'
  }
}

export function sentSentence(
  names: RoutingNames,
  instanceId: number,
  ruleName: string | undefined,
): string {
  const via =
    ruleName !== undefined ? ` via rule "${ruleName}"` : ', default route'
  return `${lead(names)} sent to ${instanceName(names, instanceId)}${via}`
}

export function syncedSentence(
  names: RoutingNames,
  instanceId: number,
  sourceInstanceId: number | undefined,
): string {
  const from =
    sourceInstanceId !== undefined
      ? ` from ${instanceName(names, sourceInstanceId)}`
      : ''
  return `${lead(names)} synced to ${instanceName(names, instanceId)}${from}`
}

export function heldSentence(names: RoutingNames, hold: RoutingHold): string {
  const held = `${lead(names)} held for approval`
  switch (hold.reason) {
    case 'rule':
      return `${held}, rule "${hold.ruleName}" requires approval`
    case 'user':
      return `${held}, user requires approval`
    case 'quota':
      return `${held}, over quota (${hold.used} of ${hold.limit} ${quotaPeriod(hold.quotaType, hold.weeklyRollingDays)})`
  }
}

export function skippedSentence(
  names: RoutingNames,
  skip: RoutingSkip,
): string {
  const skipped = `${lead(names)} skipped`
  switch (skip.reason) {
    case 'present':
      return `${skipped}, already in ${instanceList(names, skip.instanceIds)}`
    case 'excluded':
      return `${skipped}, excluded in ${instanceList(names, skip.instanceIds)}`
    case 'on-plex':
      return `${skipped}, already on Plex`
    case 'pending':
      return `${skipped}, approval already pending`
    case 'rejected':
      return `${skipped}, previously rejected`
    case 'skip-rule':
      return `${skipped} by rule "${skip.ruleName}"`
    case 'no-instance':
      return `${skipped}, no instance available`
    case 'routed-elsewhere':
      return `${skipped} sync to ${instanceName(names, skip.instanceId)}, rules route it to ${instanceList(names, skip.ruleInstanceIds)}`
    case 'no-rule-match':
      return `${skipped} sync to ${instanceName(names, skip.instanceId)}, no rule matched`
  }
}

export function failedSentence(
  names: RoutingNames,
  instanceId: number,
  reason: string,
): string {
  return `${lead(names)} to ${instanceName(names, instanceId)} failed: ${reason}`
}

function skipInstanceFields(
  skip: RoutingSkip,
): Record<string, number | number[] | undefined> {
  switch (skip.reason) {
    case 'present':
    case 'excluded':
      return skip.instanceIds.length > 1
        ? { instanceIds: skip.instanceIds }
        : { instanceId: skip.instanceIds[0] }
    case 'routed-elsewhere':
      return {
        instanceId: skip.instanceId,
        ruleInstanceIds: skip.ruleInstanceIds,
      }
    case 'no-rule-match':
      return { instanceId: skip.instanceId }
    default:
      return {}
  }
}

export function logSent(
  log: RoutingLog,
  routing: Pick<RoutingDetails, 'instanceId' | 'ruleId' | 'ruleName'>,
  settings: AppliedSettings,
): void {
  log.logger.info(
    {
      userId: log.userId,
      instanceId: routing.instanceId,
      guid: log.guid,
      ruleId: routing.ruleId,
      settings,
    },
    sentSentence(log, routing.instanceId, routing.ruleName),
  )
}

export function logSynced(
  log: RoutingLog,
  instanceId: number,
  sourceInstanceId: number | undefined,
  settings: AppliedSettings,
): void {
  log.logger.debug(
    { userId: log.userId, instanceId, guid: log.guid, settings },
    syncedSentence(log, instanceId, sourceInstanceId),
  )
}

export function logHeld(log: RoutingLog, hold: RoutingHold): void {
  const fields =
    hold.reason === 'rule'
      ? { ruleId: hold.ruleId }
      : hold.reason === 'quota'
        ? {
            quotaType: hold.quotaType,
            quotaUsage: hold.used,
            quotaLimit: hold.limit,
          }
        : {}
  log.logger[log.reconcile ? 'debug' : 'info'](
    { userId: log.userId, guid: log.guid, ...fields },
    heldSentence(log, hold),
  )
}

export function logSkipped(log: RoutingLog, skip: RoutingSkip): void {
  const level =
    skip.reason === 'no-instance'
      ? 'warn'
      : log.reconcile ||
          skip.reason === 'routed-elsewhere' ||
          skip.reason === 'no-rule-match'
        ? 'debug'
        : 'info'
  log.logger[level](
    { userId: log.userId, ...skipInstanceFields(skip), guid: log.guid },
    skippedSentence(log, skip),
  )
}

/** An add the arr rejects as already added logs as a skip, anything else as a failure. */
export function logRouteFailure(
  log: RoutingLog,
  instanceId: number,
  error: unknown,
): void {
  if (isArrAlreadyAddedError(error)) {
    logSkipped(log, { reason: 'present', instanceIds: [instanceId] })
    return
  }
  log.logger.error(
    { userId: log.userId, instanceId, guid: log.guid },
    failedSentence(log, instanceId, errorMessage(error)),
  )
}
