import {
  PLEX_SESSION_MONITORING_DEFAULTS,
  SESSION_AUTO_RESET_INTERVAL_HOURS,
  SESSION_INACTIVITY_RESET_DAYS,
  SESSION_POLLING_INTERVAL_MINUTES,
  SESSION_REMAINING_EPISODES,
} from '@root/schemas/session-monitoring/session-monitoring-config.schema'
import { useStore } from '@tanstack/react-form'
import { LockLine } from '@/components/settings/lock-line'
import { SettingsSection } from '@/components/settings/settings-section'
import { autoResetHelp } from '@/features/library/lib/session-monitoring/session-monitoring-copy'
import type { CreatableOption } from '@/hooks/useCreatableOptions'
import { withFieldGroup } from '@/lib/form'

const MONITORING_LOCK = 'Turn on session monitoring first.'
const AUTO_RESET_LOCK = 'Turn on automatic reset first.'

const DEFAULT_PROPS: { userOptions: ReadonlyArray<CreatableOption> } = {
  userOptions: [],
}

export const SessionMonitoringSettings = withFieldGroup({
  defaultValues: PLEX_SESSION_MONITORING_DEFAULTS,
  props: DEFAULT_PROPS,
  render: function Render({ group, userOptions }) {
    const enabled = useStore(group.store, (state) => state.values.enabled)
    const autoReset = useStore(
      group.store,
      (state) => state.values.enableAutoReset,
    )
    const inactivityDays = useStore(
      group.store,
      (state) => state.values.inactivityResetDays,
    )
    const locked = !enabled
    const autoResetLock = enabled && !autoReset

    return (
      <>
        <SettingsSection
          title="Monitoring"
          description="What Pulsarr watches and when it asks for more."
        >
          <group.AppField name="enabled">
            {(field) => (
              <field.SwitchField
                label="Session monitoring"
                description="Request the next season before people reach it."
              />
            )}
          </group.AppField>

          {locked && <LockLine reason={MONITORING_LOCK} />}
          <group.AppField name="pollingIntervalMinutes">
            {(field) => (
              <field.NumberField
                label="Polling interval"
                description="Only used while the live Plex connection is down."
                unit="minute"
                min={SESSION_POLLING_INTERVAL_MINUTES.min}
                max={SESSION_POLLING_INTERVAL_MINUTES.max}
                allowOutOfRange
                disabled={locked}
              />
            )}
          </group.AppField>

          <group.AppField name="remainingEpisodes">
            {(field) => (
              <field.NumberField
                label="Remaining episodes threshold"
                description="Request the next season when this many episodes are left."
                unit="episode"
                min={SESSION_REMAINING_EPISODES.min}
                max={SESSION_REMAINING_EPISODES.max}
                allowOutOfRange
                disabled={locked}
              />
            )}
          </group.AppField>
          <group.AppField name="filterUsers">
            {(field) => (
              <field.TagsField
                label="Monitored users"
                description="Leave empty to monitor everyone."
                placeholder="Everyone"
                emptyText="Everyone is already picked."
                options={userOptions}
                disabled={locked}
              />
            )}
          </group.AppField>
        </SettingsSection>
        <SettingsSection
          title="Resets and cleanup"
          description="What happens to shows nobody is watching."
        >
          {locked && <LockLine reason={MONITORING_LOCK} />}
          <group.AppField name="enableAutoReset">
            {(field) => (
              <field.SwitchField
                label="Automatic reset"
                description={autoResetHelp(inactivityDays)}
                disabled={locked}
              />
            )}
          </group.AppField>
          <group.AppField name="inactivityResetDays">
            {(field) => (
              <field.NumberField
                label="Inactivity period"
                description="No watching for this long marks a show inactive."
                unit="day"
                min={SESSION_INACTIVITY_RESET_DAYS.min}
                max={SESSION_INACTIVITY_RESET_DAYS.max}
                allowOutOfRange
                disabled={locked}
              />
            )}
          </group.AppField>

          {autoResetLock && <LockLine reason={AUTO_RESET_LOCK} />}
          <group.AppField name="autoResetIntervalHours">
            {(field) => (
              <field.NumberField
                label="Check every"
                description="How often Pulsarr looks for inactive shows."
                unit="hour"
                min={SESSION_AUTO_RESET_INTERVAL_HOURS.min}
                max={SESSION_AUTO_RESET_INTERVAL_HOURS.max}
                allowOutOfRange
                disabled={locked || !autoReset}
              />
            )}
          </group.AppField>

          <group.AppField name="enableProgressiveCleanup">
            {(field) => (
              <field.SwitchField
                label="Progressive cleanup"
                description="Deletes earlier seasons once no viewer is still on them."
                disabled={locked}
              />
            )}
          </group.AppField>
        </SettingsSection>
      </>
    )
  },
})
