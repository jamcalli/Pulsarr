import {
  QUOTA_DEFAULTS,
  QUOTA_REQUEST_LIMIT,
  WATCHLIST_CAP_ITEMS,
  WATCHLIST_CAP_SUGGESTED,
} from '@root/schemas/shared/quota-limits'
import { QuotaTypeSchema } from '@root/schemas/shared/quota-type.schema'
import { useStore } from '@tanstack/react-form'
import { SettingsSection } from '@/components/settings/settings-section'
import { withFieldGroup } from '@/lib/form'
import { QUOTA_TYPE_LABELS } from '@/lib/quota'
import type { components } from '@/types/api.js'

type QuotaType = components['schemas']['QuotaType']

export interface MediaDefaultsValues {
  quotaOn: boolean
  quotaType: QuotaType
  limit: number
  bypassApproval: boolean
  capOn: boolean
  cap?: number
}

const QUOTA_TYPE_OPTIONS = QuotaTypeSchema.options.map((value) => ({
  value,
  label: QUOTA_TYPE_LABELS[value],
}))

const DEFAULT_VALUES: MediaDefaultsValues = {
  quotaOn: false,
  quotaType: QUOTA_DEFAULTS.quotaType,
  limit: QUOTA_DEFAULTS.limit,
  bypassApproval: false,
  capOn: false,
  cap: WATCHLIST_CAP_SUGGESTED,
}

const DEFAULT_PROPS = { title: '', description: '', unit: '' }

export const MediaDefaultsSection = withFieldGroup({
  defaultValues: DEFAULT_VALUES,
  props: DEFAULT_PROPS,
  render: function Render({ group, title, description, unit }) {
    const quotaOn = useStore(group.store, (state) => state.values.quotaOn)
    const capOn = useStore(group.store, (state) => state.values.capOn)

    return (
      <SettingsSection title={title} description={description}>
        <group.AppField name="quotaOn">
          {(field) => (
            <field.SwitchField
              label="Limit requests"
              description="Requests over the limit wait for your approval."
            />
          )}
        </group.AppField>
        <group.AppField name="quotaType">
          {(field) => (
            <field.SelectField
              label="Quota period"
              description="Set rolling days and the monthly reset day on Quotas."
              options={QUOTA_TYPE_OPTIONS}
              disabled={!quotaOn}
            />
          )}
        </group.AppField>
        <group.AppField name="limit">
          {(field) => (
            <field.NumberField
              label="Requests per period"
              unit={unit}
              min={QUOTA_REQUEST_LIMIT.min}
              max={QUOTA_REQUEST_LIMIT.max}
              disabled={!quotaOn}
            />
          )}
        </group.AppField>
        <group.AppField name="bypassApproval">
          {(field) => (
            <field.SwitchField
              label="Bypass approval over the limit"
              description="Over-limit requests skip approval and the cap. Require approval still applies."
              disabled={!quotaOn}
            />
          )}
        </group.AppField>
        <group.AppField name="capOn">
          {(field) => (
            <field.SwitchField
              label="Cap the watchlist"
              description="New watchlist items past the cap are skipped instead of requested."
              disabled={!quotaOn}
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
              disabled={!quotaOn || !capOn}
            />
          )}
        </group.AppField>
      </SettingsSection>
    )
  },
})
