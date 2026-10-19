import { useState } from 'react'
import { SwitchRow } from '@/components/form/switch-row'
import { QuotaCard, QuotaCardSkeleton } from '@/components/quota/quota-card'
import { Skeleton } from '@/components/ui/skeleton'
import { GuardedRemoval } from '@/features/users/components/user/guarded-removal'
import { useRemoveQuotas } from '@/features/users/hooks/user/useRemoveQuotas'
import type { UserPageData } from '@/features/users/hooks/user/useUserPage'
import type { UserQuotasForm } from '@/features/users/hooks/user/useUserQuotasForm'
import { toQuotaValues } from '@/features/users/lib/user/user-quotas-form'
import { formatCount } from '@/lib/format'
import { QUOTA_REMOVAL_DESCRIPTION } from '@/lib/quota-fields'
import { quotaUsage } from '@/lib/quota-usage'

interface UserQuotasSectionProps {
  form: UserQuotasForm
  data: UserPageData
  name: string
  dirty: boolean
}

function RemoveQuotas({
  data,
  name,
  dirty,
  onRemoved,
}: {
  data: UserPageData
  name: string
  dirty: boolean
  onRemoved: () => void
}) {
  const [open, setOpen] = useState(false)
  const [approveHeld, setApproveHeld] = useState(false)
  const removal = useRemoveQuotas(data.id, () => {
    setOpen(false)
    onRemoved()
  })
  const held = removal.heldCount

  return (
    <GuardedRemoval
      dirty={dirty}
      open={open}
      onOpenChange={setOpen}
      onOpen={() => {
        removal.reset()
        setApproveHeld(false)
      }}
      label="Remove quotas"
      title={`Remove quotas for ${name}?`}
      description={QUOTA_REMOVAL_DESCRIPTION}
      pending={removal.pending}
      errorMessage={removal.errorMessage}
      onConfirm={() => removal.remove(held > 0 && approveHeld)}
    >
      {held > 0 && (
        <SwitchRow
          id="approve-held"
          label={`Also approve the ${formatCount(held, 'request')} held by the quota`}
          checked={approveHeld}
          disabled={removal.pending}
          onCheckedChange={setApproveHeld}
        />
      )}
    </GuardedRemoval>
  )
}

export function UserQuotasSection({
  form,
  data,
  name,
  dirty,
}: UserQuotasSectionProps) {
  const hasQuotas =
    data.quotas.movieQuota !== undefined || data.quotas.showQuota !== undefined

  return (
    <>
      <QuotaCard
        form={form}
        fields="movie"
        type="movie"
        usage={quotaUsage(data.statuses.movie, data.quotaSettings)}
      />
      <QuotaCard
        form={form}
        fields="show"
        type="show"
        usage={quotaUsage(data.statuses.show, data.quotaSettings)}
      />
      {hasQuotas && (
        <RemoveQuotas
          data={data}
          name={name}
          dirty={dirty}
          onRemoved={() => form.reset(toQuotaValues({ userId: data.id }))}
        />
      )}
    </>
  )
}

export function UserQuotasSectionSkeleton() {
  return (
    <>
      <QuotaCardSkeleton usage />
      <QuotaCardSkeleton usage />
      <Skeleton className="h-8 w-32 self-start" />
    </>
  )
}
