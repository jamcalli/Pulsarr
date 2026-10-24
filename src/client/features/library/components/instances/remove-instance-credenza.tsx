import { ConfirmCredenza } from '@/components/confirm-credenza'
import { useContentRouterRules } from '@/features/library/hooks/content-router/useContentRouterRules'
import type { ArrTarget } from '@/lib/approval'
import { INSTANCE_COPY } from '@/lib/arr/instance-copy'
import { formatCount, formatList, pluralize } from '@/lib/format'

interface RemoveInstanceCredenzaProps {
  removing: ArrTarget | null
  instances: readonly ArrTarget[]
  pending: boolean
  errorMessage: string | null
  onCancel: () => void
  onConfirm: () => void
}

function RemovedItems({
  target,
  instances,
}: {
  target: ArrTarget
  instances: readonly ArrTarget[]
}) {
  const { rules } = useContentRouterRules()
  const id = target.instance.id
  const routes = rules?.filter(
    (rule) =>
      rule.target_type === target.type && rule.target_instance_id === id,
  ).length
  const lists = instances
    .filter(({ instance }) => instance.syncedInstances?.includes(id))
    .map(({ instance }) => instance.name)

  return (
    <>
      <ul className="flex list-disc flex-col gap-1 pl-5">
        {routes !== undefined && (
          <li>
            {`${formatCount(routes, 'content router route')} that ${pluralize(routes, 'sends', 'send')} to it`}
          </li>
        )}
        <li>
          Its record of which watchlist items are on it. The items themselves
          stay.
        </li>
        {target.type === 'sonarr' && <li>Rolling monitored shows on it</li>}
        {lists.length > 0 && (
          <li>{`Its place in the synced instances of ${formatList(lists)}`}</li>
        )}
      </ul>
      <p className="text-muted-foreground">
        Pending approvals routed to it can't be approved until you change their
        routing.
      </p>
    </>
  )
}

export function RemoveInstanceCredenza({
  removing,
  instances,
  pending,
  errorMessage,
  onCancel,
  onConfirm,
}: RemoveInstanceCredenzaProps) {
  const name = removing?.instance.name ?? ''
  const last = instances.length === 1
  const description =
    removing && last
      ? INSTANCE_COPY[removing.type].lastRemoveDescription
      : 'Pulsarr deletes everything tied to it:'

  return (
    <ConfirmCredenza
      open={removing !== null}
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
      title={`Remove ${name}?`}
      description={description}
      confirmLabel={`Remove ${name}`}
      confirmVariant="destructive"
      pending={pending}
      pendingLabel="Removing..."
      errorMessage={errorMessage}
      onConfirm={onConfirm}
    >
      {removing && <RemovedItems target={removing} instances={instances} />}
    </ConfirmCredenza>
  )
}
