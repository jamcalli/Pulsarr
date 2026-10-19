import { useState } from 'react'
import {
  landingStep,
  nextStep,
  previousStep,
  type SetupFacts,
  type SetupStepId,
  stepDone,
} from '@/features/setup/lib/steps'
import { useInstances } from '@/hooks/arr/useInstances'
import { usePlexLiveStatus } from '@/hooks/usePlexLiveStatus'
import { linkedToken } from '@/lib/plex/account-facts'
import type { components } from '@/types/api.js'

const NONE_PASSED: ReadonlySet<SetupStepId> = new Set()

/** The landing step is fixed once the dialog opens with its facts loaded, and closing starts the next visit fresh. */
export function useSetupSteps(
  config: components['schemas']['Config'],
  open: boolean,
  /** Runs a step change, or holds it for confirmation while the current step is dirty. */
  leave: (change: () => void) => void,
) {
  const sonarr = useInstances('sonarr')
  const radarr = useInstances('radarr')
  const liveStatus = usePlexLiveStatus()
  const facts: SetupFacts = {
    linked: linkedToken(config) !== null,
    sonarr: sonarr.instances.length > 0,
    radarr: radarr.instances.length > 0,
    server: liveStatus === 'connected',
    ready: config._isReady,
  }
  const [current, setCurrent] = useState<SetupStepId | null>(null)
  const [passed, setPassed] = useState(NONE_PASSED)

  const settled = !facts.linked || (sonarr.hasData && radarr.hasData)
  if (open && current === null && settled) setCurrent(landingStep(facts))
  if (!open && current !== null) {
    setCurrent(null)
    setPassed(NONE_PASSED)
  }
  const step = current ?? landingStep(facts)

  const move = (id: SetupStepId | null) => {
    if (id) setCurrent(id)
  }
  const next = () => {
    setPassed((prev) => new Set(prev).add(step))
    move(nextStep(step))
  }

  return {
    current: step,
    /** False until the landing step is fixed, while the facts it depends on still load. */
    settled: current !== null,
    facts,
    instances: { sonarr, radarr },
    done: (id: SetupStepId) => stepDone(id, facts, passed),
    goTo: (id: SetupStepId) => leave(() => move(id)),
    /** Moves on without asking, for a save that just completed or a step with nothing to lose. */
    next,
    skip: () => leave(next),
    back: () => leave(() => move(previousStep(step))),
  }
}

export type SetupSteps = ReturnType<typeof useSetupSteps>
