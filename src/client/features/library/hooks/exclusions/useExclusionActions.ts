import { WATCHLIST_EXCLUSION_BULK_MAX } from '@root/schemas/watchlist-exclusions/watchlist-exclusions.schema'
import { useMutation } from '@tanstack/react-query'
import { invalidateExclusionItems } from '@/features/library/hooks/exclusions/useExclusionItems'
import {
  bulkExcludeFailure,
  bulkRemoveFailure,
  EXCLUDE_ERROR_FALLBACK,
} from '@/features/library/lib/exclusions/exclusion-copy'
import {
  chunkExclusions,
  chunkIds,
  type ExclusionOutcome,
  mergeOutcomes,
} from '@/features/library/lib/exclusions/exclusion-requests'
import {
  bulkExcludePlan,
  bulkRemovePlan,
  excludePayload,
  keysHoldingIds,
} from '@/features/library/lib/exclusions/exclusion-rows'
import { useMinLoadingMutation, withMinDuration } from '@/hooks/useMinLoading'
import type { BulkFailure } from '@/hooks/useScopedSelection'
import { apiFetch } from '@/lib/tanstackApi'
import type { components } from '@/types/api.js'

type ExclusionItem = components['schemas']['WatchlistExclusionItem']
type ExclusionUser = components['schemas']['WatchlistExclusionUser']
type ExclusionScope = components['schemas']['WatchlistExclusionScope']
type CreatePayload = components['schemas']['WatchlistExclusionCreatePayload']

export type SingleTarget =
  | { kind: 'excludeUser'; item: ExclusionItem; user: ExclusionUser }
  | { kind: 'removeUser'; item: ExclusionItem; user: ExclusionUser; id: number }
  | { kind: 'excludeGlobal'; item: ExclusionItem }
  | { kind: 'removeGlobal'; item: ExclusionItem; id: number }

export type BulkJob =
  | { kind: 'exclude'; scope: ExclusionScope; items: ExclusionItem[] }
  | { kind: 'remove'; items: ExclusionItem[] }

async function createExclusions(
  scope: ExclusionScope,
  payloads: CreatePayload[],
): Promise<ExclusionOutcome<string>> {
  const outcomes: ExclusionOutcome<string>[] = []
  for (const items of chunkExclusions(payloads, WATCHLIST_EXCLUSION_BULK_MAX)) {
    const { data, error } = await apiFetch.POST(
      '/v1/watchlist-exclusions/bulk',
      { body: { scope, items } },
    )
    if (error) throw error
    outcomes.push(data.result)
  }
  return mergeOutcomes(outcomes)
}

async function removeExclusions(
  ids: number[],
): Promise<ExclusionOutcome<number>> {
  const outcomes: ExclusionOutcome<number>[] = []
  for (const chunk of chunkIds(ids, WATCHLIST_EXCLUSION_BULK_MAX)) {
    const { data, error } = await apiFetch.POST(
      '/v1/watchlist-exclusions/bulk/remove',
      { body: { ids: chunk } },
    )
    if (error) throw error
    outcomes.push(data.result)
  }
  return mergeOutcomes(outcomes)
}

async function removeExclusion(id: number): Promise<void> {
  const { error } = await apiFetch.DELETE('/v1/watchlist-exclusions/{id}', {
    params: { path: { id } },
  })
  if (error) throw error
}

async function excludeOne(scope: ExclusionScope, payload: CreatePayload) {
  const outcome = await createExclusions(scope, [payload])
  // a failed key comes back in a 200, so surface its error the way a refused request would
  if (outcome.failed.length > 0) {
    throw { message: outcome.errors[0] ?? EXCLUDE_ERROR_FALLBACK }
  }
}

function runSingle(target: SingleTarget): Promise<void> {
  switch (target.kind) {
    case 'excludeUser':
      return excludeOne(
        'users',
        excludePayload(target.item, [target.user.userId]),
      )
    case 'excludeGlobal':
      return excludeOne(
        'global',
        excludePayload(
          target.item,
          target.item.users.map((user) => user.userId),
        ),
      )
    case 'removeUser':
    case 'removeGlobal':
      return removeExclusion(target.id)
  }
}

async function runBulk(
  job: BulkJob,
): Promise<{ failedKeys: string[]; failure: BulkFailure | null }> {
  if (job.kind === 'exclude') {
    const plan = bulkExcludePlan(job.items, job.scope)
    const outcome = await createExclusions(job.scope, plan.payloads)
    return {
      failedKeys: outcome.failed,
      failure: bulkExcludeFailure(
        outcome.failed.length,
        plan.payloads.length,
        outcome.errors,
      ),
    }
  }
  const plan = bulkRemovePlan(job.items)
  const outcome = await removeExclusions(plan.ids)
  return {
    failedKeys: keysHoldingIds(job.items, outcome.failed),
    failure: bulkRemoveFailure(
      outcome.failed.length,
      outcome.total,
      outcome.errors,
    ),
  }
}

export function useSingleExclusionAction() {
  return useMinLoadingMutation(
    useMutation({
      mutationFn: (target: SingleTarget) => withMinDuration(runSingle(target)),
      onSettled: () => invalidateExclusionItems(),
    }),
  )
}

export function useBulkExclusionAction() {
  return useMinLoadingMutation(
    useMutation({
      mutationFn: (job: BulkJob) => withMinDuration(runBulk(job)),
      onSettled: () => invalidateExclusionItems(),
    }),
  )
}
