import { useStore } from '@tanstack/react-form'
import { FactList } from '@/components/fact-list'
import { ActionRow } from '@/components/settings/action-row'
import { InfoLine } from '@/components/settings/info-line'
import { SettingsSection } from '@/components/settings/settings-section'
import { StatusPill } from '@/components/status-pill'
import type { useMaintainerrForm } from '@/features/library/hooks/exclusions/useMaintainerrForm'
import type { useMaintainerrStatus } from '@/features/library/hooks/exclusions/useMaintainerrStatus'
import {
  MAINTAINERR_EXCLUSION_MODE_HELP,
  MAINTAINERR_EXCLUSION_MODE_OPTIONS,
} from '@/features/library/lib/exclusions/maintainerr-labels'
import {
  maintainerrFacts,
  maintainerrPill,
  syncUnavailableReason,
  unsupportedVersionLine,
} from '@/features/library/lib/exclusions/maintainerr-status'
import type { components } from '@/types/api.js'

interface MaintainerrSectionProps {
  form: ReturnType<typeof useMaintainerrForm>['form']
  dirty: boolean
  config: components['schemas']['Config']
  status: ReturnType<typeof useMaintainerrStatus>
}

export function MaintainerrSection({
  form,
  dirty,
  config,
  status,
}: MaintainerrSectionProps) {
  const mode = useStore(
    form.store,
    (state) => state.values.maintainerrExclusionMode,
  )
  const pill = maintainerrPill(config.maintainerrEnabled, status.result)
  const result = config.maintainerrEnabled ? status.result : null
  const facts = result ? maintainerrFacts(result) : []
  const syncReason = syncUnavailableReason(dirty, config)

  return (
    <SettingsSection
      title="Maintainerr"
      action={<StatusPill tone={pill.tone} label={pill.label} live />}
    >
      <form.AppField name="maintainerrEnabled">
        {(field) => (
          <field.SwitchField
            label="Use Maintainerr"
            description="Excludes titles Maintainerr deletes so they are not requested again. Maintainerr never removes an exclusion."
          />
        )}
      </form.AppField>
      <form.AppField name="maintainerrUrl">
        {(field) => (
          <field.TextField
            label="Maintainerr URL"
            description="Pulsarr sets up the webhook and rule group connections there."
            type="url"
            placeholder="http://localhost:6246"
          />
        )}
      </form.AppField>
      <form.AppField name="maintainerrExclusionMode">
        {(field) => (
          <field.SelectField
            label="Exclude for"
            description={MAINTAINERR_EXCLUSION_MODE_HELP[mode]}
            options={MAINTAINERR_EXCLUSION_MODE_OPTIONS}
          />
        )}
      </form.AppField>
      {facts.length > 0 && <FactList facts={facts} />}
      {result?.status === 'unsupported_version' && (
        <InfoLine tone="warn">
          {unsupportedVersionLine(result.version)}
        </InfoLine>
      )}
      {result?.status === 'error' && result.error && (
        <InfoLine tone="danger">{result.error}</InfoLine>
      )}
      <ActionRow
        title="Sync now"
        description="Reconnects the webhook and rule groups now. Runs every hour on its own."
        buttonLabel="Sync now"
        busyLabel="Syncing..."
        disabled={syncReason !== null}
        unavailableReason={syncReason}
        running={status.syncing}
        onRun={status.sync}
        errorMessage={status.syncError}
      />
    </SettingsSection>
  )
}
