import type { BulkFailure } from '@/hooks/useScopedSelection'
import { CONTENT_TYPE_PLURAL_LABELS } from '@/lib/content-type'
import { formatCount, formatNumber, pluralize } from '@/lib/format'
import type { components } from '@/types/api.js'

type ExclusionItem = components['schemas']['WatchlistExclusionItem']
type ExclusionScope = components['schemas']['WatchlistExclusionScope']

export interface ExclusionConfirmCopy {
  title: string
  description: string
  confirmLabel: string
  pendingLabel: string
  variant: 'default' | 'destructive'
}

const EXCLUDE = {
  confirmLabel: 'Exclude',
  pendingLabel: 'Excluding...',
  variant: 'default',
} as const

const REMOVE = {
  confirmLabel: 'Remove',
  pendingLabel: 'Removing...',
  variant: 'destructive',
} as const

function typeLabel(item: ExclusionItem): string {
  return CONTENT_TYPE_PLURAL_LABELS[item.type].toLowerCase()
}

function deleteSyncLine(subject: string, type: string): string {
  return `Delete sync can remove ${subject} once no watchlister is left unexcluded and deletion is on for ${type}.`
}

export function excludeUserCopy(
  item: ExclusionItem,
  userName: string,
): ExclusionConfirmCopy {
  return {
    title: `Exclude ${item.title} for ${userName}`,
    description: `Pulsarr stops routing it for them. ${deleteSyncLine('it', typeLabel(item))}`,
    ...EXCLUDE,
  }
}

export function excludeGlobalCopy(item: ExclusionItem): ExclusionConfirmCopy {
  return {
    title: `Exclude ${item.title} for everyone`,
    description: `Pulsarr stops routing it for every user, including anyone who adds it later. ${deleteSyncLine('it', typeLabel(item))}`,
    ...EXCLUDE,
  }
}

export function removeUserCopy(
  item: ExclusionItem,
  userName: string,
): ExclusionConfirmCopy {
  return {
    title: `Remove the exclusion of ${item.title} for ${userName}`,
    description: `Pulsarr routes it again for ${userName} on the next sync if it is still on their watchlist.`,
    ...REMOVE,
  }
}

export function removeGlobalCopy(
  item: ExclusionItem,
  ownCount: number,
): ExclusionConfirmCopy {
  const stay =
    ownCount > 0
      ? ` ${formatCount(ownCount, 'per-user exclusion')} ${pluralize(ownCount, 'stays', 'stay')}.`
      : ''
  return {
    title: `Remove the global exclusion of ${item.title}`,
    description: `Pulsarr routes it again for watchlisters without their own exclusion.${stay}`,
    ...REMOVE,
  }
}

const BULK_EXCLUDE_BODY: Record<ExclusionScope, string> = {
  users: `Pulsarr stops routing them for each watchlister. ${deleteSyncLine('a title', 'its type')}`,
  global: `Pulsarr stops routing them for every user, including anyone who adds them later. ${deleteSyncLine('a title', 'its type')}`,
}

const BULK_EXCLUDE_SKIP_REASON: Record<ExclusionScope, string> = {
  users: 'nobody left to exclude',
  global: 'a global exclusion already',
}

export function bulkExcludeCopy(
  count: number,
  scope: ExclusionScope,
  skipped: number,
): ExclusionConfirmCopy & { skippedLine: string | null } {
  const titles = formatCount(count, 'title')
  return {
    title: `Exclude ${titles}`,
    description: BULK_EXCLUDE_BODY[scope],
    skippedLine:
      skipped > 0
        ? `${formatCount(skipped, 'title')} ${pluralize(skipped, 'has', 'have')} ${BULK_EXCLUDE_SKIP_REASON[scope]} and ${pluralize(skipped, 'is', 'are')} skipped.`
        : null,
    ...EXCLUDE,
    confirmLabel: `Exclude ${formatCount(count - skipped, 'title')}`,
  }
}

export function bulkRemoveCopy(
  rows: number,
  exclusions: number,
): ExclusionConfirmCopy {
  return {
    title: `Remove exclusions from ${formatCount(rows, 'title')}`,
    description:
      'Pulsarr routes these titles again on the next sync for anyone still watching them.',
    ...REMOVE,
    confirmLabel: `Remove ${formatCount(exclusions, 'exclusion')}`,
  }
}

/** Null when every title went through. */
export function bulkExcludeFailure(
  failed: number,
  titles: number,
  errors: readonly string[],
): BulkFailure | null {
  if (failed === 0) return null
  return {
    message: `${formatNumber(failed)} of ${formatCount(titles, 'title')} ${pluralize(failed, 'was', 'were')} not excluded.`,
    detail: errors[0] ?? null,
  }
}

/** Null when every exclusion was removed. */
export function bulkRemoveFailure(
  failed: number,
  exclusions: number,
  errors: readonly string[],
): BulkFailure | null {
  if (failed === 0) return null
  return {
    message: `${formatNumber(failed)} of ${formatCount(exclusions, 'exclusion')} ${pluralize(failed, 'was', 'were')} not removed.`,
    detail: errors[0] ?? null,
  }
}

export const EXCLUDE_ERROR_FALLBACK = 'Nothing was excluded. Try again.'
export const REMOVE_ERROR_FALLBACK = 'Nothing was removed. Try again.'
