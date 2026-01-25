/**
 * Detection Module
 *
 * Episode/season detection and upgrade tracking.
 */

export { type EpisodeCheckerDeps, isRecentEpisode } from './episode-checker.js'
export {
  fetchExpectedEpisodeCount,
  isSeasonComplete,
  type SeasonCompletionDeps,
} from './season-completion.js'
export {
  checkForUpgrade,
  type UpgradeTrackerDeps,
} from './upgrade-tracker.js'
