import type { PlexUserRow } from '@/features/users/lib/plex-users/user-rows'
import {
  type BlankQuotaField,
  blankQuotaField,
  QUOTA_FIELD_DEFAULTS,
  type QuotaFieldValues,
  quotaPayload,
} from '@/features/users/lib/quota-fields'
import {
  USER_SWITCHES,
  type UserSwitch,
} from '@/features/users/lib/user-switches'
import type { BulkFailure } from '@/hooks/useScopedSelection'
import { formatCount, formatList, formatNumber, pluralize } from '@/lib/format'
import { displayName } from '@/lib/user-naming'
import type { components, paths } from '@/types/api.js'

type BulkQuotaPayload = components['schemas']['UserQuotaBulkOperationPayload']
type BulkUserUpdates =
  paths['/v1/users/bulk']['patch']['requestBody']['content']['application/json']['updates']

export type BulkChoice = 'keep' | 'on' | 'off'

export const BULK_CHOICE_OPTIONS: ReadonlyArray<{
  value: BulkChoice
  label: string
}> = [
  { value: 'keep', label: 'Leave as is' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
]

export type BulkSettingsValues = Record<UserSwitch, BulkChoice> & {
  clearAlias: boolean
  clearDiscordId: boolean
  clearApprise: boolean
}

export const BULK_SETTINGS_DEFAULTS: BulkSettingsValues = {
  notify_discord: 'keep',
  notify_discord_mention: 'keep',
  notify_apprise: 'keep',
  notify_plex_mobile: 'keep',
  can_sync: 'keep',
  requires_approval: 'keep',
  clearAlias: false,
  clearDiscordId: false,
  clearApprise: false,
}

export function bulkSettingsChangeCount(values: BulkSettingsValues): number {
  const switches = USER_SWITCHES.filter((key) => values[key] !== 'keep').length
  const clears = [
    values.clearAlias,
    values.clearDiscordId,
    values.clearApprise,
  ].filter(Boolean).length
  return switches + clears
}

/** Only the switches set to On or Off, and a cleared destination also turns its switch off. */
export function bulkSettingsUpdates(
  values: BulkSettingsValues,
): BulkUserUpdates {
  const updates: BulkUserUpdates = {}
  for (const key of USER_SWITCHES) {
    if (values[key] !== 'keep') updates[key] = values[key] === 'on'
  }
  if (values.clearAlias) updates.alias = null
  if (values.clearDiscordId) {
    updates.discord_id = null
    updates.notify_discord = false
  }
  if (values.clearApprise) {
    updates.apprise = null
    updates.notify_apprise = false
  }
  return updates
}

export type BulkQuotaAction = 'set' | 'clear'

export const BULK_QUOTA_ACTION_OPTIONS: ReadonlyArray<{
  value: BulkQuotaAction
  label: string
}> = [
  { value: 'set', label: 'Set quotas' },
  { value: 'clear', label: 'Remove quotas' },
]

export interface BulkQuotaValues {
  action: BulkQuotaAction
  movie: QuotaFieldValues
  show: QuotaFieldValues
}

const BULK_QUOTA_FIELDS: QuotaFieldValues = {
  ...QUOTA_FIELD_DEFAULTS,
  on: true,
}

export const BULK_QUOTA_DEFAULTS: BulkQuotaValues = {
  action: 'set',
  movie: BULK_QUOTA_FIELDS,
  show: BULK_QUOTA_FIELDS,
}

export function blankBulkQuotaField(
  values: BulkQuotaValues,
): BlankQuotaField | null {
  if (values.action !== 'set') return null
  return blankQuotaField([values.movie, values.show])
}

/** Sets or deletes each type's quota, or deletes both when clearing. */
export function bulkQuotaPayload(
  values: BulkQuotaValues,
  userIds: number[],
): BulkQuotaPayload {
  if (values.action === 'clear') return { userIds, operation: 'delete' }
  return {
    userIds,
    operation: 'update',
    movieQuota: quotaPayload(values.movie),
    showQuota: quotaPayload(values.show),
  }
}

export const BULK_ERROR_FALLBACK = 'The users were not updated. Try again.'

/** Null when every selected user was updated. */
export function bulkUserFailure(
  failedIds: readonly number[],
  selected: readonly PlexUserRow[],
): BulkFailure | null {
  if (failedIds.length === 0) return null
  const failed = selected.filter((row) => failedIds.includes(row.user.id))
  return {
    message: `${formatNumber(failedIds.length)} of ${formatCount(selected.length, 'user')} ${pluralize(failedIds.length, 'was', 'were')} not updated.`,
    detail:
      failed.length > 0
        ? formatList(failed.map((row) => displayName(row.user)))
        : null,
  }
}
