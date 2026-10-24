import type { RollingRecord } from '@/features/library/lib/session-monitoring/rolling-shows'

export type TriggerState = 'pending' | 'grabbed' | 'passed'

export type SeasonTrigger =
  | { kind: 'episode'; episode: number; state: TriggerState }
  | { kind: 'pilot' }
  | { kind: 'none' }

export interface SeasonProgress {
  episode: number
  total: number
  trigger: SeasonTrigger
  /** The trigger episode, set only for an episode trigger. */
  marker?: number
}

/** The episode whose play leaves `remainingEpisodes` or fewer in the season. */
export function triggerEpisode(
  total: number,
  remainingEpisodes: number,
): number {
  return Math.max(1, total - remainingEpisodes)
}

function triggerState(viewer: RollingRecord, episode: number): TriggerState {
  if (viewer.current_monitored_season > viewer.last_watched_season) {
    return 'grabbed'
  }
  return viewer.last_watched_episode >= episode ? 'passed' : 'pending'
}

function seasonTrigger(
  show: RollingRecord,
  viewer: RollingRecord,
  total: number,
  remainingEpisodes: number,
): SeasonTrigger {
  if (show.monitoring_type === 'allSeasonPilotRolling') return { kind: 'pilot' }
  if (
    show.monitoring_type === 'pilotRolling' &&
    viewer.last_watched_season === 1 &&
    viewer.last_watched_episode <= 1
  ) {
    return { kind: 'none' }
  }
  const episode = triggerEpisode(total, remainingEpisodes)
  return {
    kind: 'episode',
    episode,
    state: triggerState(viewer, episode),
  }
}

/** Null when the show has no stored length for the viewer's season. */
export function seasonProgress(
  show: RollingRecord,
  viewer: RollingRecord,
  remainingEpisodes: number,
): SeasonProgress | null {
  const total = show.season_episode_counts?.[viewer.last_watched_season]
  if (!total) return null
  const trigger = seasonTrigger(show, viewer, total, remainingEpisodes)
  return {
    episode: viewer.last_watched_episode,
    total,
    trigger,
    marker: trigger.kind === 'episode' ? trigger.episode : undefined,
  }
}
