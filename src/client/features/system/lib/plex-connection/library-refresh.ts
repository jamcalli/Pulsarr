import { ARR_API_KEY_PLACEHOLDER } from '@root/schemas/common/arr-placeholder'
import type { StatusPillView } from '@/components/status-pill'
import type { components } from '@/types/api.js'

type NotificationResults =
  components['schemas']['PlexNotificationResponse']['results']
type ArrType = keyof NotificationResults

type RefreshState = 'set' | 'unset' | 'failed'

export interface RefreshRow {
  key: string
  type: ArrType
  name: string
  state: RefreshState
  /** The server's reason, only on a failed row. */
  message: string | null
}

/** Status reads whether each instance has the connection, a run reports what each change did. */
type RefreshSource = 'status' | 'setup' | 'remove'

export const REFRESH_PILLS: Record<RefreshState, StatusPillView> = {
  set: { tone: 'on', label: 'Set up' },
  unset: { tone: 'off', label: 'Not set up' },
  failed: { tone: 'failed', label: 'Failed' },
}

function stateOf(source: RefreshSource, success: boolean): RefreshState {
  if (source === 'status') return success ? 'set' : 'unset'
  if (!success) return 'failed'
  return source === 'setup' ? 'set' : 'unset'
}

/** Ids of the instances that are configured, so the placeholder left after the last delete never shows. */
export function configuredIds(
  instances: ReadonlyArray<{ id: number; apiKey: string }>,
): Set<number> {
  return new Set(
    instances
      .filter((instance) => instance.apiKey !== ARR_API_KEY_PLACEHOLDER)
      .map((instance) => instance.id),
  )
}

export function refreshRows(
  results: NotificationResults,
  source: RefreshSource,
  configured: Record<ArrType, Set<number>>,
): RefreshRow[] {
  const types: ArrType[] = ['radarr', 'sonarr']
  return types.flatMap((type) =>
    results[type]
      .filter((result) => configured[type].has(result.id))
      .map((result) => {
        const state = stateOf(source, result.success)
        return {
          key: `${type}-${result.id}`,
          type,
          name: result.name,
          state,
          message: state === 'failed' ? result.message : null,
        }
      }),
  )
}

export function setUpNames(rows: readonly RefreshRow[]): string[] {
  return rows.filter((row) => row.state === 'set').map((row) => row.name)
}
