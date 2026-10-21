import { Info } from 'lucide-react'
import { type ReactNode, useId, useState } from 'react'
import { BusyLabel } from '@/components/busy-label'
import { ErrorAlert } from '@/components/error-alert'
import { FactList } from '@/components/fact-list'
import { SwitchRow } from '@/components/form/switch-row'
import { SyncSteps } from '@/components/plex/sync-steps'
import { StatusPill } from '@/components/status-pill'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  type SetupStepProps,
  StepLayout,
} from '@/features/setup/components/step-layout'
import type { SetupFacts } from '@/features/setup/lib/steps'
import { useWatchlistSync } from '@/hooks/plex/useWatchlistSync'
import { invalidateConfig } from '@/hooks/useConfig'
import { useMinLoadingMutation } from '@/hooks/useMinLoading'
import { useSyncStatus } from '@/hooks/useSyncStatus'
import { NAV_PAGES } from '@/lib/navigation'
import { watchlistFacts } from '@/lib/plex/account-facts'
import { isRunning, type SyncRun, startRun } from '@/lib/plex/sync-run'
import { $api, mutationErrorMessage } from '@/lib/tanstackApi'
import { useSetupStore } from '@/stores/setupStore'
import type { components } from '@/types/api.js'

type FinishPhase =
  | 'loading'
  | 'before'
  | 'onboarded'
  | 'syncing'
  | 'failed'
  | 'synced'
  | 'starting'
  | 'on'

const WAITING_RUN = startRun('link')

type Owner = 'loading' | 'present' | 'absent'

function ownerState(
  users: ReadonlyArray<components['schemas']['UserWithCount']> | undefined,
  isError: boolean,
): Owner {
  if (isError) return 'absent'
  if (users === undefined) return 'loading'
  return users.some((user) => user.is_primary_token) ? 'present' : 'absent'
}

function finishPhase({
  starting,
  alreadyOn,
  launched,
  owner,
  otherRunning,
  run,
}: {
  starting: boolean
  alreadyOn: boolean
  launched: boolean
  owner: Owner
  otherRunning: boolean
  run: SyncRun | null
}): FinishPhase {
  if (alreadyOn) return 'on'
  if (starting) return 'starting'
  if (!launched) {
    if (owner === 'loading') return 'loading'
    return owner === 'present' && !otherRunning ? 'onboarded' : 'before'
  }
  if (run === null || run.ranAt === null) return 'syncing'
  return run.error ? 'failed' : 'synced'
}

function missingInstanceNote(
  facts: SetupFacts,
): { title: string; description: string } | null {
  if (!facts.sonarr && !facts.radarr) {
    return {
      title: 'No Sonarr or Radarr instance yet.',
      description: 'Requests wait in the queue until one exists.',
    }
  }
  if (!facts.radarr) {
    return {
      title: 'No Radarr instance yet.',
      description: 'Movie requests wait in the queue until one exists.',
    }
  }
  if (!facts.sonarr) {
    return {
      title: 'No Sonarr instance yet.',
      description: 'Show requests wait in the queue until one exists.',
    }
  }
  return null
}

export function FinishStep({ steps, onDirtyChange }: SetupStepProps) {
  const dismiss = useSetupStore((state) => state.dismiss)
  const sync = useWatchlistSync({ page: NAV_PAGES.dashboard })
  const start = useMinLoadingMutation(
    $api.useMutation('post', '/v1/watchlist-workflow/start-background'),
  )
  const workflow = useSyncStatus()
  const users = $api.useQuery('get', '/v1/users/list/with-counts')
  const owner = ownerState(users.data?.users, users.isError)
  // A link run outlives a closed dialog, so reopening attaches to it and only a resync stays hidden
  const [launched, setLaunched] = useState(() => sync.run?.kind === 'link')
  const [staleRun, setStaleRun] = useState<SyncRun | null>(() =>
    launched ? null : sync.run,
  )
  const ownRun = launched && sync.run !== staleRun ? sync.run : null

  const [startOnLaunch, setStartOnLaunch] = useState(true)
  const startOnLaunchId = useId()

  const phase = finishPhase({
    starting: start.isPending,
    alreadyOn: workflow.state === 'running' && !(launched && isRunning(ownRun)),
    launched,
    owner,
    otherRunning: sync.running,
    run: ownRun,
  })
  const otherRun = !launched && sync.running ? sync.run : null
  const shownRun =
    phase === 'loading' ||
    phase === 'before' ||
    (phase === 'syncing' && ownRun === null)
      ? (otherRun ?? WAITING_RUN)
      : ownRun
  const syncedFacts =
    users.data && (phase === 'onboarded' || (phase === 'starting' && !launched))
      ? watchlistFacts(users.data.users)
      : null
  const showStartOnLaunch =
    phase === 'onboarded' || phase === 'synced' || phase === 'starting'
  const instanceNote = missingInstanceNote(steps.facts)

  const runSync = () => {
    setLaunched(true)
    setStaleRun(sync.run)
    sync.start('link')
  }
  const startWorkflow = () => {
    start.reset()
    start.mutate(
      { body: { autoStart: startOnLaunch } },
      {
        onSuccess: () => {
          void invalidateConfig()
          dismiss()
        },
      },
    )
  }

  const startActions = (
    <>
      <Button type="button" variant="outline" onClick={dismiss}>
        Explore settings first
      </Button>
      <Button type="button" onClick={startWorkflow}>
        Start workflow
      </Button>
    </>
  )

  const actions = {
    loading: (
      <Button type="button" disabled>
        Sync watchlists
      </Button>
    ),
    before: (
      <Button type="button" disabled={sync.running} onClick={runSync}>
        Sync watchlists
      </Button>
    ),
    onboarded: startActions,
    syncing: (
      <Button type="button" disabled>
        <BusyLabel busy label="Sync watchlists" busyLabel="Syncing..." />
      </Button>
    ),
    failed: (
      <Button type="button" disabled={sync.running} onClick={runSync}>
        Retry
      </Button>
    ),
    synced: startActions,
    starting: (
      <>
        <Button type="button" variant="outline" disabled>
          Explore settings first
        </Button>
        <Button type="button" disabled>
          <BusyLabel busy label="Start workflow" busyLabel="Starting..." />
        </Button>
      </>
    ),
    on: (
      <Button type="button" onClick={dismiss}>
        Done
      </Button>
    ),
  } satisfies Record<FinishPhase, ReactNode>

  return (
    <StepLayout
      step="finish"
      onDirtyChange={onDirtyChange}
      onBack={
        phase === 'loading' ||
        phase === 'before' ||
        phase === 'onboarded' ||
        phase === 'syncing' ||
        phase === 'failed'
          ? steps.back
          : null
      }
      backDisabled={phase === 'syncing'}
      onSkip={null}
      note={phase === 'before' ? sync.blockedReason : null}
      actions={actions[phase]}
    >
      {phase === 'on' && (
        <p className="flex items-center gap-2 text-sm">
          <StatusPill tone="on" label="Running" />
          Syncing is on.
        </p>
      )}
      {shownRun && <SyncSteps run={shownRun} />}
      {syncedFacts && <FactList facts={syncedFacts} />}
      {showStartOnLaunch && (
        <SwitchRow
          id={startOnLaunchId}
          label="Start on launch"
          checked={startOnLaunch}
          disabled={phase === 'starting'}
          onCheckedChange={setStartOnLaunch}
        />
      )}
      <ErrorAlert
        message={
          start.isError
            ? mutationErrorMessage(
                start.error,
                "The workflow didn't start. Try again.",
              )
            : null
        }
      />
      {instanceNote && (
        <Alert variant="info">
          <Info />
          <AlertTitle>{instanceNote.title}</AlertTitle>
          <AlertDescription>{instanceNote.description}</AlertDescription>
        </Alert>
      )}
    </StepLayout>
  )
}
