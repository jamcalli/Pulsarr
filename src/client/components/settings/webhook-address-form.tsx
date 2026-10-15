import { PORT_RANGE } from '@root/schemas/shared/port'
import { useStore } from '@tanstack/react-form'
import { InlineCode } from '@/components/inline-code'
import { ActionResults } from '@/components/settings/action-results'
import {
  type ArrInstanceResultRow,
  ArrInstanceResultsTable,
} from '@/components/settings/arr-instance-results'
import { withFieldGroup } from '@/lib/form'
import {
  WEBHOOK_PRESET_OPTIONS,
  WEBHOOK_PRESETS,
  type WebhookAddressValues,
  webhookAddress,
} from '@/lib/webhook-address'
import type { components } from '@/types/api.js'

const DEFAULT_VALUES: WebhookAddressValues = {
  preset: 'localhost',
  baseUrl: WEBHOOK_PRESETS.localhost.baseUrl,
  port: WEBHOOK_PRESETS.localhost.port,
}

const DEFAULT_PROPS: { disabled?: boolean } = {}

export const WebhookAddressForm = withFieldGroup({
  defaultValues: DEFAULT_VALUES,
  props: DEFAULT_PROPS,
  render: function Render({ group, disabled = false }) {
    const preset = useStore(group.store, (state) => state.values.preset)
    const port = useStore(group.store, (state) => state.values.port)
    const baseUrl = useStore(group.store, (state) => state.values.baseUrl)
    const usesPort = !baseUrl.startsWith('https://')

    return (
      <>
        <group.AppField
          name="preset"
          listeners={{
            onChange: ({ value }) => {
              group.setFieldValue('baseUrl', WEBHOOK_PRESETS[value].baseUrl)
              group.setFieldValue('port', WEBHOOK_PRESETS[value].port)
            },
          }}
        >
          {(field) => (
            <field.SelectField
              label="How servers reach Pulsarr"
              description={WEBHOOK_PRESETS[preset].description}
              disabled={disabled}
              options={WEBHOOK_PRESET_OPTIONS}
            />
          )}
        </group.AppField>
        <group.AppField name="baseUrl">
          {(field) => (
            <field.TextField
              label="Address"
              orientation="vertical"
              type="url"
              placeholder="https://pulsarr.example.com"
              disabled={disabled}
              preview={(value) => (
                <>
                  Webhooks go to{' '}
                  <InlineCode>{webhookAddress(value, port)}</InlineCode>
                </>
              )}
            />
          )}
        </group.AppField>
        {usesPort && (
          <group.AppField name="port">
            {(field) => (
              <field.NumberField
                label="Port"
                min={PORT_RANGE.min}
                max={PORT_RANGE.max}
                grouping={false}
                disabled={disabled}
              />
            )}
          </group.AppField>
        )}
      </>
    )
  },
})

const WEBHOOK_PILLS = {
  updated: { tone: 'on', label: 'Updated' },
  failed: { tone: 'failed', label: 'Failed' },
} as const

export function WebhookResults({
  ranAt,
  results,
}: {
  ranAt: number
  results: components['schemas']['ArrWebhookResults']
}) {
  const rows: ArrInstanceResultRow[] = (['radarr', 'sonarr'] as const).flatMap(
    (type) =>
      results[type].map((row) => ({
        key: `${type}-${row.instanceId}`,
        type,
        name: row.name,
        pill: row.success ? WEBHOOK_PILLS.updated : WEBHOOK_PILLS.failed,
        message: row.success ? null : row.message,
      })),
  )

  return (
    <ActionResults ranAt={ranAt}>
      <ArrInstanceResultsTable
        rows={rows}
        caption="Webhook update by instance"
        statusLabel="Result"
      />
    </ActionResults>
  )
}
