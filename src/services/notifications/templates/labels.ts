import type { ApprovalTrigger } from '@root/types/approval.types.js'
import { episodeCode } from '@root/utils/episode-code.js'

export const EVENT_LABELS = {
  mediaAvailable: 'Media ready',
  approvalRequest: 'Approval request',
  approvalResolved: 'Approval resolved',
  approvalAuto: 'Auto approval',
  deleteSync: 'Delete sync',
  updateAvailable: 'Update available',
  watchlistAdded: 'Watchlist add',
  watchlistRemoved: 'Watchlist remove',
  watchlistCap: 'Watchlist cap',
  userCreated: 'User created',
} as const

export type NotificationEvent = keyof typeof EVENT_LABELS

export const APPROVAL_TRIGGER_LABELS: Record<ApprovalTrigger, string> = {
  quota_exceeded: 'Quota Exceeded',
  router_rule: 'Router Rule',
  manual_flag: 'Manual Flag',
  content_criteria: 'Content Criteria',
}

export function formatTriggerReason(
  trigger: ApprovalTrigger,
  reason?: string | null,
): string {
  const label = APPROVAL_TRIGGER_LABELS[trigger]
  return reason ? `${label}\n${reason}` : label
}

export function mediaTypeLabel(type: string): {
  label: string
  emoji: string
} {
  const normalized = type ? type.toLowerCase() : ''

  if (normalized === 'movie') {
    return { label: 'Movie', emoji: '🎬' }
  }
  if (normalized === 'show' || normalized === 'tv' || normalized === 'series') {
    return { label: 'Show', emoji: '📺' }
  }
  return { label: 'Media', emoji: '🎬' }
}

export function userLabel(
  name: string | null | undefined,
  userId: number,
): string {
  return name || `User ${userId}`
}

export const WATCHLIST_CAP_TITLE = 'Watchlist Cap Reached'

export const WATCHLIST_CAP_IMPACT =
  'New items will not be processed until the cap is raised or items are removed.'

export const TEST_NOTIFICATION = {
  title: 'Pulsarr test notification',
  body: 'If you can read this, your notification setup is working.',
} as const

/** Delivery line subject, `Title (movie)` or `Title (show) S01E02 "Episode"`. */
export function describeContent(
  title: string,
  type: 'movie' | 'show',
  episode?: { seasonNumber?: number; episodeNumber?: number; title?: string },
): string {
  const subject = `${title} (${type})`
  if (episode?.seasonNumber === undefined) return subject
  const code = episodeCode(episode.seasonNumber, episode.episodeNumber)
  return episode.title
    ? `${subject} ${code} "${episode.title}"`
    : `${subject} ${code}`
}
