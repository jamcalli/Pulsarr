import { ActionResults } from '@/components/settings/action-results'
import { ActionRow } from '@/components/settings/action-row'
import { useSyncExisting } from '@/features/library/hooks/instances/useSyncExisting'
import { INSTANCE_COPY } from '@/features/library/lib/instances/instance-copy'
import type { ArrType } from '@/features/library/lib/instances/instance-form'

interface SyncExistingRowProps {
  type: ArrType
  sourceName: string
  target: { id: number; name: string }
  dirty: boolean
}

export function SyncExistingRow({
  type,
  sourceName,
  target,
  dirty,
}: SyncExistingRowProps) {
  const sync = useSyncExisting(type, target)
  const result = sync.result && (
    <ActionResults ranAt={sync.result.ranAt}>
      <p className="text-sm">{sync.result.data.message}</p>
    </ActionResults>
  )

  return (
    <ActionRow
      title={`Copy existing content to ${target.name}`}
      description={INSTANCE_COPY[type].copyDescription(sourceName, target.name)}
      buttonLabel="Copy existing content"
      busyLabel="Copying..."
      disabled={dirty}
      unavailableReason={dirty ? 'Save or discard your changes first.' : null}
      running={sync.running}
      onRun={sync.run}
      progress={sync.progress}
      result={result}
      errorMessage={sync.errorMessage}
    />
  )
}
