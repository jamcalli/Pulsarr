import type { StatusPillView } from '@/components/status-pill'
import { needsSetup } from '@/features/library/lib/instances/instance-form'
import { type ArrTarget, NOT_SET } from '@/lib/approval'
import { formatList } from '@/lib/format'

export type InstanceHealth =
  | 'connected'
  | 'failed'
  | 'callback_failed'
  | 'unknown'

export interface InstanceCardSummary {
  name: string
  isDefault: boolean
  url: string | null
  facts: Array<{ label: string; value: string }>
  status: StatusPillView | null
}

interface SummaryContext {
  instances: readonly ArrTarget[]
  health: InstanceHealth
  profileName: string | null
}

function status(
  target: ArrTarget,
  health: InstanceHealth,
): InstanceCardSummary['status'] {
  if (health === 'failed') return { tone: 'failed', label: "Can't connect" }
  if (health === 'callback_failed') {
    return { tone: 'pending', label: "Can't reach Pulsarr" }
  }
  if (needsSetup(target)) return { tone: 'pending', label: 'Needs setup' }
  if (health === 'connected') return { tone: 'on', label: 'Connected' }
  return null
}

export function instanceSummary(
  target: ArrTarget,
  { instances, health, profileName }: SummaryContext,
): InstanceCardSummary {
  const { instance } = target
  const stored = instance.qualityProfile
  const facts = [
    {
      label: 'Quality profile',
      value:
        stored == null || stored === ''
          ? NOT_SET
          : (profileName ?? String(stored)),
    },
    { label: 'Root folder', value: instance.rootFolder || NOT_SET },
  ]
  const fallback = instances.find(({ instance: other }) => other.isDefault)
  const syncedNames = instances
    .filter(({ instance: other }) =>
      instance.syncedInstances?.includes(other.id),
    )
    .map(({ instance: other }) => other.name)

  if (instance.isDefault && syncedNames.length > 0) {
    facts.push({ label: 'Synced instances', value: formatList(syncedNames) })
  } else if (
    !instance.isDefault &&
    fallback?.instance.syncedInstances?.includes(instance.id)
  ) {
    facts.push({
      label: 'Receives',
      value: `Everything sent to ${fallback.instance.name}`,
    })
  }

  return {
    name: instance.name,
    isDefault: instance.isDefault,
    url: instance.baseUrl,
    facts,
    status: status(target, health),
  }
}
