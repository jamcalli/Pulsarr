import { ActionRow } from '@/components/settings/action-row'
import { SettingsSection } from '@/components/settings/settings-section'
import { StatusPill } from '@/components/status-pill'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from '@/components/ui/item'
import { CheckResults } from '@/features/library/components/session-monitoring/check-results'
import { useCheckSessions } from '@/features/library/hooks/session-monitoring/useCheckSessions'
import { LIVE_STATE_PILLS } from '@/features/library/lib/session-monitoring/live-status'
import { liveConnectionLine } from '@/features/library/lib/session-monitoring/session-monitoring-copy'
import { usePlexLiveStatus } from '@/hooks/usePlexLiveStatus'
import { UNSAVED_CHANGES_REASON } from '@/lib/settings'

interface StatusSectionProps {
  dirty: boolean
  pollingMinutes: number
}

function LiveConnectionRow({ pollingMinutes }: { pollingMinutes: number }) {
  const state = usePlexLiveStatus() ?? 'connecting'
  const pill = LIVE_STATE_PILLS[state]

  return (
    <Item className="p-0">
      <ItemContent>
        <ItemTitle>Plex live connection</ItemTitle>
        <ItemDescription className="line-clamp-none">
          {liveConnectionLine(state, pollingMinutes)}
        </ItemDescription>
      </ItemContent>
      <ItemActions role="status" aria-live="polite">
        <StatusPill tone={pill.tone} label={pill.label} />
      </ItemActions>
    </Item>
  )
}

export function StatusSection({ dirty, pollingMinutes }: StatusSectionProps) {
  const check = useCheckSessions()

  return (
    <SettingsSection
      title="Status"
      lock={dirty ? { reason: UNSAVED_CHANGES_REASON } : undefined}
    >
      <LiveConnectionRow pollingMinutes={pollingMinutes} />
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
