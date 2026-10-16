import { TriangleAlert } from 'lucide-react'
import { SettingsSection } from '@/components/settings/settings-section'
import { Alert, AlertTitle } from '@/components/ui/alert'
import { useLogSettings } from '@/features/system/hooks/logs/useLogSettings'
import { levelWarning } from '@/features/system/lib/logs/log-copy'
import {
  type ConfigLogLevel,
  LOG_LEVEL_OPTIONS,
} from '@/features/system/lib/logs/log-levels'
import {
  type InitialLines,
  initialLineOptions,
} from '@/features/system/lib/logs/log-prefs'

interface LogSettingsSectionProps {
  savedLevel: ConfigLogLevel
  initialLines: InitialLines
  onInitialLinesChange: (next: InitialLines) => void
}

export function LogSettingsSection(props: LogSettingsSectionProps) {
  const settings = useLogSettings(props)
  const { form } = settings
  const warning = levelWarning(props.savedLevel, settings.restore)

  return (
    <SettingsSection title="Log settings">
      <div className="flex flex-col gap-3">
        <form.AppField
          name="logLevel"
          listeners={{ onChange: ({ value }) => settings.changeLevel(value) }}
        >
          {(field) => (
            <field.SelectField
              label="Application log level"
              disabled={settings.saving}
              error={settings.errorMessage}
              options={LOG_LEVEL_OPTIONS}
            />
          )}
        </form.AppField>
        {warning && (
          <Alert variant="warn">
            <TriangleAlert />
            <AlertTitle>{warning}</AlertTitle>
          </Alert>
        )}
      </div>
      <form.AppField
        name="initialLines"
        listeners={{
          onChange: ({ value }) => settings.changeInitialLines(value),
        }}
      >
        {(field) => (
          <field.SelectField
            label="Initial lines"
            description="Lines loaded on connect."
            options={initialLineOptions()}
          />
        )}
      </form.AppField>
    </SettingsSection>
  )
}
