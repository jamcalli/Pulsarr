import { LiveConnectionRow } from '@/components/plex/live-connection-row'
import { ActionRow } from '@/components/settings/action-row'
import { SettingsSection } from '@/components/settings/settings-section'
import { CheckResults } from '@/features/library/components/session-monitoring/check-results'
import { useCheckSessions } from '@/features/library/hooks/session-monitoring/useCheckSessions'
import { liveConnectionLine } from '@/features/library/lib/session-monitoring/session-monitoring-copy'
import { UNSAVED_CHANGES_REASON } from '@/lib/settings'

interface StatusSectionProps {
  dirty: boolean
  pollingMinutes: number
}

export function StatusSection({ dirty, pollingMinutes }: StatusSectionProps) {
  const check = useCheckSessions()

  return (
    <SettingsSection
      title="Status"
      lock={dirty ? { reason: UNSAVED_CHANGES_REASON } : undefined}
    >
      <LiveConnectionRow
        describe={(state) => liveConnectionLine(state, pollingMinutes)}
      />
      <ActionRow
        title="Check sessions now"
        description="Read what is playing on Plex now."
        buttonLabel="Check now"
        busyLabel="Checking..."
        disabled={dirty}
        running={check.running}
        onRun={() => check.run()}
        result={
          check.result && (
            <CheckResults
              ranAt={check.result.ranAt}
              result={check.result.data}
            />
          )
        }
        errorMessage={check.errorMessage}
      />
    </SettingsSection>
  )
}
