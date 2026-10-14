import { SettingsSectionSkeleton } from '@/components/settings/settings-page-skeleton'
import { SettingsSection } from '@/components/settings/settings-section'
import { StatusPill } from '@/components/status-pill'
import { Skeleton } from '@/components/ui/skeleton'
import {
  QuotaFields,
  QuotaFieldsSkeleton,
} from '@/features/users/components/quota-fields'
import { QUOTA_FIELD_DEFAULTS } from '@/features/users/lib/quota-fields'
import type { QuotaUsage } from '@/features/users/lib/quota-usage'
import { CONTENT_TYPE_PLURAL_LABELS } from '@/lib/content-type'
import { withFieldGroup } from '@/lib/form'
import type { components } from '@/types/api.js'

type ContentType = components['schemas']['ContentType']

const USAGE_ROW = 'flex flex-wrap items-center gap-2'

const QUOTA_FIELD_MAP = {
  on: 'on',
  quotaType: 'quotaType',
  quotaLimit: 'quotaLimit',
  bypassApproval: 'bypassApproval',
  capOn: 'capOn',
  cap: 'cap',
} as const

const DEFAULT_PROPS: {
  type: ContentType
  description?: string
  usage?: QuotaUsage | null
} = { type: 'movie' }

export const QuotaCard = withFieldGroup({
  defaultValues: QUOTA_FIELD_DEFAULTS,
  props: DEFAULT_PROPS,
  render: function Render({ group, type, description, usage }) {
    return (
      <SettingsSection
        title={CONTENT_TYPE_PLURAL_LABELS[type]}
        description={description}
      >
        {usage && (
          <div className={USAGE_ROW}>
            <span>{usage.text}</span>
            {usage.atLimit && <StatusPill tone="pending" label="At limit" />}
          </div>
        )}
        <QuotaFields form={group} fields={QUOTA_FIELD_MAP} unit={type} />
      </SettingsSection>
    )
  },
})

export function QuotaCardSkeleton({
  description = false,
  usage = false,
}: {
  description?: boolean
  usage?: boolean
}) {
  return (
    <SettingsSectionSkeleton description={description}>
      {usage && (
        <div className={USAGE_ROW}>
          <Skeleton className="h-5 w-56 max-w-full" />
        </div>
      )}
      <QuotaFieldsSkeleton />
    </SettingsSectionSkeleton>
  )
}
