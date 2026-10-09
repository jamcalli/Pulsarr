import type { ApprovalRequest } from '@root/types/approval.types.js'
import type { Item as WatchlistItem } from '@root/types/plex.types.js'
import type { WatchlistExclusion } from '@root/types/watchlist-exclusion.types.js'
import type {
  DiagnosticApproval,
  DiagnosticExclusion,
  DiagnosticInstance,
  DiagnosticItem,
  DiagnosticPresence,
  DiagnosticQuotaSummary,
  WatchlistDiagnostics,
} from '@schemas/watchlist-diagnostics/watchlist-diagnostics.schema.js'
import { SYSTEM_USER_ID } from '@services/database/methods/watchlist-exclusion.js'
import type { DatabaseService } from '@services/database.service.js'
import { isRateLimitError } from '@services/plex-watchlist/api/helpers.js'
import {
  canonicalizeGuids,
  diffWatchlist,
  extractContentIds,
  guidsOverlap,
  type LiveWatchlistItem,
  normalizeWatchlistKey,
  type StoredWatchlistItem,
} from '@services/watchlist-diagnostics/diff.js'
import {
  DIAGNOSTICS_MAX_PAGES,
  DIAGNOSTICS_PAGE_SIZE,
  type FetchLiveWatchlistOptions,
  fetchLiveWatchlist,
  type LiveWatchlistResult,
} from '@services/watchlist-diagnostics/live-fetch.js'
import {
  diagnoseItem,
  type WorkflowSnapshot,
} from '@services/watchlist-diagnostics/reasons.js'
import { RECONCILIATION_JOB_NAME } from '@services/watchlist-workflow/lifecycle/scheduler.js'
import { parseGuids } from '@utils/guid-handler.js'
import { createServiceLogger } from '@utils/logger.js'
import type { FastifyBaseLogger } from 'fastify'

/** Minimum gap between two diagnostic runs for the same user. */
export const DIAGNOSTICS_USER_COOLDOWN_MS = 60_000

/** SQLite caps bound parameters, so large watchlists are read in chunks. */
const JUNCTION_CHUNK_SIZE = 500

/**
 * The only database methods diagnostics may call. Every one is a plain read,
 * so the read-only guarantee is enforced by the type as well as by tests.
 */
export type DiagnosticsDb = Pick<
  DatabaseService,
  | 'getUser'
  | 'getAllWatchlistRadarrInstanceJunctions'
  | 'getAllWatchlistSonarrInstanceJunctions'
  | 'getAllRadarrInstances'
  | 'getAllSonarrInstances'
  | 'getApprovalRequestsByCriteria'
  | 'getRouterRuleById'
  | 'getExclusionsForUser'
  | 'getQuotaStatus'
  | 'getScheduleByName'
> & {
  // Declared with a `this: DatabaseService` parameter, so restated callable
  getAllWatchlistItemsForUser(userId: number): Promise<WatchlistItem[]>
}

export interface WatchlistDiagnosticsDeps {
  db: DiagnosticsDb
  getPlexTokens: () => string[]
  getWorkflowStatus: () => { status: string; rssMode: boolean }
  fetchLive?: (
    options: FetchLiveWatchlistOptions,
  ) => Promise<LiveWatchlistResult>
  now?: () => number
}

export type WatchlistDiagnosticsErrorCode =
  | 'user_not_found'
  | 'not_configured'
  | 'busy'
  | 'cooldown'
  | 'plex_rate_limited'
  | 'plex_unavailable'

const STATUS_CODES: Record<WatchlistDiagnosticsErrorCode, number> = {
  user_not_found: 404,
  not_configured: 400,
  busy: 429,
  cooldown: 429,
  plex_rate_limited: 503,
  plex_unavailable: 502,
}

export class WatchlistDiagnosticsError extends Error {
  readonly statusCode: number

  constructor(
    readonly code: WatchlistDiagnosticsErrorCode,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message)
    this.name = 'WatchlistDiagnosticsError'
    this.statusCode = STATUS_CODES[code]
  }
}

type StoredRow = Awaited<
  ReturnType<DiagnosticsDb['getAllWatchlistItemsForUser']>
>[number] & { id?: number | string }

/**
 * Explains, for one user, why each watchlist item is or is not in
 * Radarr/Sonarr. Strictly read-only: it reads the live Plex watchlist and the
 * database and never writes, routes, or contacts an arr instance. Runs are
 * manual, one at a time, and rate-limited per user to stay polite to Plex.
 */
export class WatchlistDiagnosticsService {
  private readonly log: FastifyBaseLogger
  private readonly lastRunByUser = new Map<number, number>()
  private running = false

  constructor(
    baseLog: FastifyBaseLogger,
    private readonly deps: WatchlistDiagnosticsDeps,
  ) {
    this.log = createServiceLogger(baseLog, 'WATCHLIST_DIAGNOSTICS')
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }

  async run(
    userId: number,
    signal?: AbortSignal,
  ): Promise<WatchlistDiagnostics> {
    const user = await this.deps.db.getUser(userId)
    if (!user) {
      throw new WatchlistDiagnosticsError('user_not_found', 'User not found')
    }

    const tokens = this.deps.getPlexTokens().filter(Boolean)
    if (tokens.length === 0) {
      throw new WatchlistDiagnosticsError(
        'not_configured',
        'No Plex token is configured',
      )
    }
    if (!user.is_primary_token && !user.plex_uuid) {
      throw new WatchlistDiagnosticsError(
        'not_configured',
        'This user has no Plex account ID yet; run a full sync first',
      )
    }

    if (this.running) {
      throw new WatchlistDiagnosticsError(
        'busy',
        'Another diagnostic is already running; try again when it finishes',
        5,
      )
    }

    const lastRun = this.lastRunByUser.get(userId)
    const now = this.now()
    if (lastRun !== undefined && now - lastRun < DIAGNOSTICS_USER_COOLDOWN_MS) {
      const retryAfterSeconds = Math.ceil(
        (DIAGNOSTICS_USER_COOLDOWN_MS - (now - lastRun)) / 1000,
      )
      throw new WatchlistDiagnosticsError(
        'cooldown',
        `Diagnostics for this user ran recently; try again in ${retryAfterSeconds}s`,
        retryAfterSeconds,
      )
    }

    // The cooldown counts from the start so failed runs cannot hammer Plex
    this.lastRunByUser.set(userId, now)
    this.running = true
    try {
      const live = await this.fetchLive(user, tokens, signal)
      signal?.throwIfAborted()
      return await this.buildReport(user, live)
    } finally {
      this.running = false
    }
  }

  private async fetchLive(
    user: NonNullable<Awaited<ReturnType<DiagnosticsDb['getUser']>>>,
    tokens: string[],
    signal: AbortSignal | undefined,
  ): Promise<LiveWatchlistResult> {
    const fetchLive = this.deps.fetchLive ?? fetchLiveWatchlist
    try {
      return await fetchLive({
        tokens,
        isPrimary: user.is_primary_token,
        plexUuid: user.plex_uuid ?? null,
        username: user.name,
        log: this.log,
        signal,
        maxPages: DIAGNOSTICS_MAX_PAGES,
      })
    } catch (error) {
      if (signal?.aborted) throw error
      if (isRateLimitError(error)) {
        throw new WatchlistDiagnosticsError(
          'plex_rate_limited',
          'Plex is rate limiting requests right now; try again in a minute',
          60,
        )
      }
      this.log.warn(
        { userId: user.id, error },
        'Failed to fetch live Plex watchlist for diagnostics',
      )
      throw new WatchlistDiagnosticsError(
        'plex_unavailable',
        'Could not fetch the live Plex watchlist for this user',
      )
    }
  }

  private async buildReport(
    user: NonNullable<Awaited<ReturnType<DiagnosticsDb['getUser']>>>,
    live: LiveWatchlistResult,
  ): Promise<WatchlistDiagnostics> {
    const { db } = this.deps
    const now = this.now()

    const rows = (await db.getAllWatchlistItemsForUser(user.id)) as StoredRow[]
    const stored = rows.map(toStoredItem)
    const watchlistIds = stored.map((item) => item.id)

    const [
      radarrJunctions,
      sonarrJunctions,
      radarrInstances,
      sonarrInstances,
      approvals,
      userExclusions,
      globalExclusions,
      movieQuota,
      showQuota,
      schedule,
    ] = await Promise.all([
      inChunks(watchlistIds, (ids) =>
        db.getAllWatchlistRadarrInstanceJunctions(ids),
      ),
      inChunks(watchlistIds, (ids) =>
        db.getAllWatchlistSonarrInstanceJunctions(ids),
      ),
      db.getAllRadarrInstances(),
      db.getAllSonarrInstances(),
      db.getApprovalRequestsByCriteria({ userId: user.id }),
      db.getExclusionsForUser(user.id),
      db.getExclusionsForUser(SYSTEM_USER_ID),
      db.getQuotaStatus(user.id, 'movie'),
      db.getQuotaStatus(user.id, 'show'),
      db.getScheduleByName(RECONCILIATION_JOB_NAME),
    ])

    const ruleNames = await this.loadRuleNames(approvals)

    const radarrNames = new Map(radarrInstances.map((i) => [i.id, i.name]))
    const sonarrNames = new Map(sonarrInstances.map((i) => [i.id, i.name]))
    const instancesByItem = new Map<number, DiagnosticInstance[]>()
    const addInstance = (watchlistId: number, instance: DiagnosticInstance) => {
      const list = instancesByItem.get(watchlistId) ?? []
      list.push(instance)
      instancesByItem.set(watchlistId, list)
    }
    for (const junction of radarrJunctions) {
      addInstance(junction.watchlist_id, {
        arr: 'radarr',
        instanceId: junction.radarr_instance_id,
        instanceName:
          radarrNames.get(junction.radarr_instance_id) ??
          `Radarr #${junction.radarr_instance_id}`,
        status: junction.status,
        isPrimary: Boolean(junction.is_primary),
        syncing: Boolean(junction.syncing),
        lastNotifiedAt: junction.last_notified_at ?? null,
      })
    }
    for (const junction of sonarrJunctions) {
      addInstance(junction.watchlist_id, {
        arr: 'sonarr',
        instanceId: junction.sonarr_instance_id,
        instanceName:
          sonarrNames.get(junction.sonarr_instance_id) ??
          `Sonarr #${junction.sonarr_instance_id}`,
        status: junction.status,
        isPrimary: Boolean(junction.is_primary),
        syncing: Boolean((junction as { syncing?: boolean }).syncing),
        lastNotifiedAt: junction.last_notified_at ?? null,
      })
    }

    const exclusionByKey = indexExclusions(userExclusions, globalExclusions)
    const workflowStatus = this.deps.getWorkflowStatus()
    const workflow: WorkflowSnapshot = {
      status: workflowStatus.status,
      nextReconciliationAt:
        schedule?.enabled && schedule.next_run?.time
          ? schedule.next_run.time
          : null,
    }
    const capExceeded = {
      movie: movieQuota?.watchlistCapExceeded ?? false,
      show: showQuota?.watchlistCapExceeded ?? false,
    }

    const diff = diffWatchlist(live.items, stored)
    const storedPresence: DiagnosticPresence = live.truncated
      ? 'not_checked'
      : 'pulsarr_only'

    const describe = (
      presence: DiagnosticPresence,
      liveItem: LiveWatchlistItem | null,
      storedItem: StoredWatchlistItem | null,
    ): DiagnosticItem => {
      const key = storedItem?.key ?? liveItem?.key ?? ''
      const type = (
        storedItem?.type ??
        liveItem?.type ??
        'unknown'
      ).toLowerCase()
      const guids = storedItem?.guids ?? []
      const canonical = canonicalizeGuids(guids)
      const instances = storedItem
        ? (instancesByItem.get(storedItem.id) ?? [])
        : []
      const approval = findApproval(approvals, key, type, guids, ruleNames)
      const exclusion = exclusionByKey.get(normalizeWatchlistKey(key)) ?? null

      const { state, reason } = diagnoseItem({
        presence,
        type,
        status: storedItem?.status ?? null,
        guids,
        instances,
        approval,
        exclusion,
        canSync: user.can_sync,
        watchlistCapExceeded:
          type === 'movie' || type === 'show' ? capExceeded[type] : false,
        workflow,
        now,
      })

      return {
        key,
        title: storedItem?.title ?? liveItem?.title ?? 'Unknown Title',
        type,
        presence,
        state,
        reason,
        watchlistItemId: storedItem?.id ?? null,
        status: storedItem?.status ?? null,
        addedAt: storedItem?.added ?? null,
        guids: canonical,
        ids: extractContentIds(canonical),
        instances,
        approval,
        exclusion,
        lastNotifiedAt: latest([
          storedItem?.lastNotifiedAt ?? null,
          ...instances.map((instance) => instance.lastNotifiedAt),
        ]),
      }
    }

    const items: DiagnosticItem[] = [
      ...diff.plexOnly.map((item) => describe('plex_only', item, null)),
      ...diff.matched.map(({ live: liveItem, stored: storedItem }) =>
        describe('both', liveItem, storedItem),
      ),
      ...diff.pulsarrOnly.map((item) => describe(storedPresence, null, item)),
    ]

    const routed = items.filter((item) => item.state === 'routed').length

    this.log.info(
      {
        userId: user.id,
        liveItems: live.items.length,
        storedItems: stored.length,
        plexOnly: diff.plexOnly.length,
        pulsarrOnly: diff.pulsarrOnly.length,
        truncated: live.truncated,
      },
      'Watchlist diagnostics completed',
    )

    return {
      user: {
        id: user.id,
        name: user.name,
        isPrimary: Boolean(user.is_primary_token),
        canSync: Boolean(user.can_sync),
        requiresApproval: Boolean(user.requires_approval),
      },
      generatedAt: new Date(now).toISOString(),
      live: {
        source: live.source,
        itemCount: live.items.length,
        truncated: live.truncated,
        maxItems: DIAGNOSTICS_MAX_PAGES * DIAGNOSTICS_PAGE_SIZE,
      },
      workflow: {
        status: workflowStatus.status,
        rssMode: workflowStatus.rssMode,
        nextReconciliationAt: workflow.nextReconciliationAt,
      },
      quotas: {
        movie: toQuotaSummary(movieQuota),
        show: toQuotaSummary(showQuota),
      },
      summary: {
        onPlex: diff.plexOnly.length + diff.matched.length,
        inPulsarr: stored.length,
        plexOnly: diff.plexOnly.length,
        pulsarrOnly: live.truncated ? 0 : diff.pulsarrOnly.length,
        routed,
        needsAttention: items.length - routed,
      },
      items,
    }
  }

  private async loadRuleNames(
    approvals: ApprovalRequest[],
  ): Promise<Map<number, string>> {
    const ids = [
      ...new Set(
        approvals
          .map((approval) => approval.routerRuleId)
          .filter((id): id is number => typeof id === 'number'),
      ),
    ]
    const names = new Map<number, string>()
    await Promise.all(
      ids.map(async (id) => {
        const rule = await this.deps.db.getRouterRuleById(id)
        if (rule) names.set(id, rule.name)
      }),
    )
    return names
  }
}

function toStoredItem(row: StoredRow): StoredWatchlistItem {
  return {
    id: Number(row.id),
    key: normalizeWatchlistKey(row.key),
    title: row.title,
    type: row.type,
    status: row.status,
    guids: parseGuids(row.guids),
    added: row.added ?? null,
    lastNotifiedAt: row.last_notified_at ?? null,
  }
}

async function inChunks<T>(
  ids: number[],
  load: (chunk: number[]) => Promise<T[]>,
): Promise<T[]> {
  const results: T[] = []
  for (let i = 0; i < ids.length; i += JUNCTION_CHUNK_SIZE) {
    results.push(...(await load(ids.slice(i, i + JUNCTION_CHUNK_SIZE))))
  }
  return results
}

/** A global exclusion outranks a per-user one, mirroring the router's veto. */
function indexExclusions(
  userExclusions: WatchlistExclusion[],
  globalExclusions: WatchlistExclusion[],
): Map<string, DiagnosticExclusion> {
  const byKey = new Map<string, DiagnosticExclusion>()
  for (const exclusion of userExclusions) {
    byKey.set(normalizeWatchlistKey(exclusion.key), {
      scope: 'user',
      excludedAt: exclusion.excluded_at,
    })
  }
  for (const exclusion of globalExclusions) {
    byKey.set(normalizeWatchlistKey(exclusion.key), {
      scope: 'global',
      excludedAt: exclusion.excluded_at,
    })
  }
  return byKey
}

/**
 * Approval requests are stored by Plex key, but a re-matched item can come
 * back under a new key, so a same-type request with an overlapping
 * TMDB/TVDB/IMDb ID also counts. Requests arrive newest first.
 */
function findApproval(
  approvals: ApprovalRequest[],
  key: string,
  type: string,
  guids: string[],
  ruleNames: Map<number, string>,
): DiagnosticApproval | null {
  const normalizedKey = normalizeWatchlistKey(key)
  const match =
    approvals.find(
      (approval) =>
        normalizeWatchlistKey(approval.contentKey) === normalizedKey,
    ) ??
    (guids.length > 0
      ? approvals.find(
          (approval) =>
            approval.contentType === type &&
            guidsOverlap(approval.contentGuids, guids),
        )
      : undefined)
  if (!match) return null

  return {
    id: match.id,
    status: match.status,
    triggeredBy: match.triggeredBy,
    reason: match.approvalReason ?? null,
    ruleName:
      match.routerRuleId != null
        ? (ruleNames.get(match.routerRuleId) ?? null)
        : null,
    createdAt: match.createdAt,
  }
}

function latest(values: Array<string | null>): string | null {
  let best: string | null = null
  let bestTime = Number.NEGATIVE_INFINITY
  for (const value of values) {
    if (!value) continue
    const time = Date.parse(value)
    if (Number.isFinite(time) && time > bestTime) {
      best = value
      bestTime = time
    }
  }
  return best
}

function toQuotaSummary(
  quota: Awaited<ReturnType<DiagnosticsDb['getQuotaStatus']>>,
): DiagnosticQuotaSummary | null {
  if (!quota) return null
  return {
    exceeded: quota.exceeded,
    currentUsage: quota.currentUsage,
    quotaLimit: quota.quotaLimit,
    bypassApproval: quota.bypassApproval,
    watchlistCap: quota.watchlistCap ?? null,
    watchlistUsage: quota.watchlistUsage ?? null,
    watchlistCapExceeded: quota.watchlistCapExceeded ?? false,
  }
}
