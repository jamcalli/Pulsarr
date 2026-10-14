import {
  QUOTA_REQUEST_LIMIT,
  WATCHLIST_CAP_ITEMS,
} from '@root/schemas/shared/quota-limits'
import { useStore } from '@tanstack/react-form'
import { FieldRowSkeleton } from '@/components/settings/settings-page-skeleton'
import { QUOTA_FIELD_DEFAULTS } from '@/features/users/lib/quota-fields'
import { withFieldGroup } from '@/lib/form'
import { QUOTA_TYPE_OPTIONS } from '@/lib/quota'

const DEFAULT_PROPS: { unit: string; disabled?: boolean } = { unit: '' }

export const QuotaFields = withFieldGroup({
  defaultValues: QUOTA_FIELD_DEFAULTS,
  props: DEFAULT_PROPS,
  render: function Render({ group, unit, disabled = false }) {
    const on = useStore(group.store, (state) => state.values.on)
    const capOn = useStore(group.store, (state) => state.values.capOn)
    const bypass = useStore(group.store, (state) => state.values.bypassApproval)
    const quotaOff = disabled || !on
    const capLocked = quotaOff || bypass
    const capDescription = bypass
      ? "The cap doesn't apply while bypass is on."
      : 'New watchlist items past the cap are skipped instead of requested.'

    return (
      <>
        <group.AppField name="on">
          {(field) => (
            <field.SwitchField
              label="Limit requests"
              description="Requests over the limit wait for your approval."
              disabled={disabled}
            />
          )}
        </group.AppField>
        <group.AppField name="quotaType">
          {(field) => (
            <field.SelectField
              label="Quota period"
              description="Set rolling days and the monthly reset day on Quotas."
              options={QUOTA_TYPE_OPTIONS}
              disabled={quotaOff}
            />
          )}
        </group.AppField>
        <group.AppField name="quotaLimit">
          {(field) => (
            <field.NumberField
              label="Requests per period"
              unit={unit}
              min={QUOTA_REQUEST_LIMIT.min}
              max={QUOTA_REQUEST_LIMIT.max}
              disabled={quotaOff}
            />
          )}
        </group.AppField>
        <group.AppField name="bypassApproval">
          {(field) => (
            <field.SwitchField
              label="Bypass approval over the limit"
              description="Over-limit requests skip approval, and the cap is off."
              disabled={quotaOff}
            />
          )}
        </group.AppField>
        <group.AppField name="capOn">
          {(field) => (
            <field.SwitchField
              label="Cap the watchlist"
              description={capDescription}
              disabled={capLocked}
            />
          )}
        </group.AppField>
        <group.AppField name="cap">
          {(field) => (
            <field.NumberField
              label="Watchlist cap"
              unit={unit}
              min={WATCHLIST_CAP_ITEMS.min}
              max={WATCHLIST_CAP_ITEMS.max}
              disabled={capLocked || !capOn}
            />
          )}
        </group.AppField>
      </>
    )
  },
})

export function QuotaFieldsSkeleton() {
  return (
    <>
      <FieldRowSkeleton control="switch" />
      <FieldRowSkeleton control="input" />
      <FieldRowSkeleton control="input" description={false} />
      <FieldRowSkeleton control="switch" />
      <FieldRowSkeleton control="switch" />
      <FieldRowSkeleton control="input" description={false} />
    </>
  )
}
