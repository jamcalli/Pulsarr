import { SEASON_MONITORING_LABELS } from '@root/schemas/sonarr/season-monitoring.schema'
import { ROLLING_MODE_START } from '@/features/library/lib/session-monitoring/rolling-labels'
import {
  formatCount,
  formatDate,
  formatList,
  formatNumber,
  pluralize,
} from '@/lib/format'
import { LIVE_STATE_LINES, type LiveState } from '@/lib/plex-live-status'
import type { components } from '@/types/api.js'

type RollingMode = components['schemas']['SonarrRollingMonitoring']
type CheckResult = components['schemas']['SessionMonitoringResult']

const NAMED_SHOWS_MAX = 6

function days(count: number): string {
  return formatCount(count, 'day')
}

export function liveConnectionLine(
  state: LiveState,
  pollingMinutes: number,
): string {
  const every = formatCount(pollingMinutes, 'minute')
  const lines: Record<LiveState, string> = {
    connected: `${LIVE_STATE_LINES.connected} Polling every ${every} is the fallback.`,
    disconnected: `Live connection down. Polling every ${every} until it is back.`,
    connecting: LIVE_STATE_LINES.connecting,
  }
  return lines[state]
}

export function checkSummary(result: CheckResult): string {
  return `${formatCount(result.processedSessions, 'session')} processed, ${formatCount(result.triggeredSearches, 'search', 'searches')} triggered, ${formatCount(result.rollingUpdates.length, 'rolling change')}.`
}

export function inactiveMeaning(inactivityDays: number): string {
  return `Inactive means no watching or changes for ${days(inactivityDays)}.`
}

export function noInactiveDescription(inactivityDays: number): string {
  return `Every rolling show was watched or changed in the last ${days(inactivityDays)}.`
}

export function pausedNotice(count: number): string {
  return `Monitoring is off. These ${formatCount(count, 'show')} are paused until it is back on.`
}

/** Falls back to naming the setting while the draft value is not a number. */
export function autoResetHelp(inactivityDays: number | undefined): string {
  const period =
    inactivityDays === undefined
      ? 'the inactivity period'
      : days(inactivityDays)
  return `Reset shows with no watching or changes for ${period}.`
}

export function enrolledLine(instanceName: string, createdAt: string): string {
  return `On ${instanceName}, enrolled ${formatDate(Date.parse(createdAt))}.`
}

export function viewerProgress(season: number, episode: number): string {
  return `Season ${formatNumber(season)}, episode ${formatNumber(episode)}`
}

/** Names up to six shows, then counts them. */
export function namedShows(titles: readonly string[]): string {
  return titles.length <= NAMED_SHOWS_MAX
    ? formatList(titles)
    : `These ${formatCount(titles.length, 'show')}`
}

export function resetShowCopy(
  title: string,
  mode: RollingMode,
  instanceName: string,
  viewers: number,
): [string, string] {
  const progress =
    viewers > 0
      ? `, and progress for ${formatCount(viewers, 'viewer')} is cleared`
      : ''
  return [
    `${title} goes back to ${ROLLING_MODE_START[mode]} only.`,
    `Episode files rolling added are deleted from ${instanceName}${progress}.`,
  ]
}

export function stopRollingCopy(
  title: string,
  instanceName: string,
): [string, string] {
  return [
    `Pulsarr stops tracking ${title}, so it no longer expands.`,
    `Nothing is deleted and episodes stay in ${instanceName}. Viewing progress is not kept.`,
  ]
}

export function resetInactiveCopy(
  titles: readonly string[],
  inactivityDays: number,
): [string, string] {
  return [
    `${namedShows(titles)}, inactive for ${days(inactivityDays)}, go back to their mode's start.`,
    'Episode files rolling added are deleted and viewing progress is cleared.',
  ]
}

export function startOverCopy(
  titles: readonly string[],
  mode: RollingMode,
): [string, string] {
  return [
    `${namedShows(titles)} restart on ${SEASON_MONITORING_LABELS[mode].toLowerCase()}.`,
    `Every episode is unmonitored and files beyond ${ROLLING_MODE_START[mode]} are deleted.`,
  ]
}

export function enrollmentSummary(total: number, failed: number): string {
  return `${formatNumber(total - failed)} of ${formatCount(total, 'show')} updated.`
}

export function enrollmentFailure(failed: number): string {
  return `${formatCount(failed, 'show')} ${pluralize(failed, 'was', 'were')} not updated.`
}
