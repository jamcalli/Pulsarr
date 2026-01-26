/**
 * Detection Module
 *
 * Episode/season detection.
 */

export { type EpisodeCheckerDeps, isRecentEpisode } from './episode-checker.js'
export {
  fetchExpectedEpisodeCount,
  isSeasonComplete,
  type SeasonCompletionDeps,
} from './season-completion.js'
