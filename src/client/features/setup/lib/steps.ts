import { PLEX_SERVER_DESCRIPTION } from '@/lib/plex/server-address'

export type SetupStepId =
  | 'plex'
  | 'server'
  | 'sonarr'
  | 'radarr'
  | 'defaults'
  | 'finish'

export const SETUP_STEPS: readonly SetupStepId[] = [
  'plex',
  'server',
  'sonarr',
  'radarr',
  'defaults',
  'finish',
]

export const SETUP_STEP_LABELS: Record<SetupStepId, string> = {
  plex: 'Plex account',
  server: 'Plex server',
  sonarr: 'Sonarr',
  radarr: 'Radarr',
  defaults: 'New user defaults',
  finish: 'Start syncing',
}

export const SETUP_STEP_DESCRIPTIONS: Record<SetupStepId, string> = {
  plex: "Pulsarr reads watchlists through the server owner's Plex account.",
  server: PLEX_SERVER_DESCRIPTION,
  sonarr: 'Where shows go.',
  radarr: 'Where movies go.',
  defaults: 'What new Plex users start with.',
  finish: 'Read every watchlist once, then turn on syncing.',
}

export interface SetupFacts {
  linked: boolean
  /** A real instance exists, the placeholder row does not count. */
  sonarr: boolean
  radarr: boolean
  /** The live connection to the owner's Plex server is up. */
  server: boolean
  ready: boolean
}

/** Plex until linked, Sonarr until any instance exists, then finish until the workflow is ready. */
export function landingStep(facts: SetupFacts): SetupStepId {
  if (!facts.linked) return 'plex'
  if (!facts.sonarr && !facts.radarr) return 'sonarr'
  if (!facts.ready) return 'finish'
  return 'plex'
}

/** Done means the fact exists, or for New user defaults that the admin moved past it in this dialog session. */
export function stepDone(
  id: SetupStepId,
  facts: SetupFacts,
  passed: ReadonlySet<SetupStepId>,
): boolean {
  switch (id) {
    case 'plex':
      return facts.linked
    case 'sonarr':
      return facts.sonarr
    case 'radarr':
      return facts.radarr
    case 'server':
      return facts.server
    case 'finish':
      return facts.ready
    case 'defaults':
      return passed.has(id)
  }
}

export function nextStep(id: SetupStepId): SetupStepId | null {
  return SETUP_STEPS[SETUP_STEPS.indexOf(id) + 1] ?? null
}

export function previousStep(id: SetupStepId): SetupStepId | null {
  const index = SETUP_STEPS.indexOf(id)
  return index > 0 ? (SETUP_STEPS[index - 1] ?? null) : null
}
