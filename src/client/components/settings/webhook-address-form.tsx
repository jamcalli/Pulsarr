import { PORT_RANGE } from '@root/schemas/shared/port'
import { useStore } from '@tanstack/react-form'
import { InlineCode } from '@/components/inline-code'
import {
  ActionResults,
  ResultsTableHeader,
} from '@/components/settings/action-results'
import { StatusPill } from '@/components/status-pill'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { ARR_TYPE_LABELS } from '@/lib/arr-labels'
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

export function WebhookResults({
  ranAt,
  results,
}: {
  ranAt: number
  results: components['schemas']['ArrWebhookResults']
}) {
  const rows = [
    ...results.radarr.map((row) => ({ ...row, type: 'radarr' as const })),
    ...results.sonarr.map((row) => ({ ...row, type: 'sonarr' as const })),
  ]

  return (
    <ActionResults ranAt={ranAt}>
      <Table className="text-xs">
        <ResultsTableHeader
          columns={[
            { label: 'Instance' },
            { label: 'Type', className: 'max-md:hidden' },
            { label: 'Result', className: 'text-right' },
          ]}
        />
        <TableBody>
          {rows.map((row) => (
            <TableRow key={`${row.type}-${row.instanceId}`}>
              <TableCell className="whitespace-normal">
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{row.name}</span>
                  <span className="text-muted-foreground md:hidden">
                    {ARR_TYPE_LABELS[row.type]}
                  </span>
                  {!row.success && (
                    <span className="text-muted-foreground">{row.message}</span>
                  )}
                </div>
              </TableCell>
              <TableCell className="align-top max-md:hidden">
                {ARR_TYPE_LABELS[row.type]}
              </TableCell>
              <TableCell className="text-right align-top">
                <StatusPill
                  tone={row.success ? 'on' : 'failed'}
                  label={row.success ? 'Updated' : 'Failed'}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ActionResults>
  )
}
