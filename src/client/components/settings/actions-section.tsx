import { ActionResults } from '@/components/settings/action-results'
import { ActionRow } from '@/components/settings/action-row'
import { SettingsSection } from '@/components/settings/settings-section'
import type { ActionState } from '@/lib/action-state'

export interface ActionSpec {
  id: string
  title: string
  description: string
  buttonLabel: string
  busyLabel: string
  destructive?: boolean
  state: ActionState
  onRun: () => void
}

interface ActionsSectionProps {
  dirty: boolean
  actions: readonly ActionSpec[]
}

export function ActionsSection({ dirty, actions }: ActionsSectionProps) {
  const anyRunning = actions.some(({ state }) => state.running)
  const blocked = dirty || anyRunning

  return (
    <SettingsSection
      title="Run now"
      description="These use your saved settings."
      lock={
        dirty
          ? { reason: 'Save or discard your changes before running these.' }
          : undefined
      }
    >
      {actions.map(({ id, state, onRun, destructive, ...row }) => (
        <ActionRow
          key={id}
          title={row.title}
          description={row.description}
          buttonLabel={row.buttonLabel}
          busyLabel={row.busyLabel}
          variant={destructive ? 'destructive' : 'default'}
          disabled={blocked || state.unavailableReason !== null}
          unavailableReason={state.unavailableReason}
          running={state.running}
          onRun={onRun}
          progress={state.progress}
          result={
            state.result && (
              <ActionResults
                ranAt={state.result.ranAt}
                rows={state.result.rows}
              />
            )
          }
          errorMessage={state.errorMessage}
        />
      ))}
    </SettingsSection>
  )
}
