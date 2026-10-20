import type { AppriseMessageType } from '@root/types/apprise.types.js'
import type { DeleteSyncResult } from '@root/types/delete-sync.types.js'
import type {
  AppriseMessage,
  ApprovalNotification,
  MediaNotification,
  UpdateAvailableRelease,
  WatchlistCapNotification,
} from '@root/types/notification.types.js'
import {
  type DeleteSyncSection,
  sectionEmptyText,
  sectionMoreText,
  summarizeDeleteSync,
} from './delete-sync-summary.js'
import {
  BLOCK_GAP,
  CARD,
  DESTRUCTIVE,
  DESTRUCTIVE_TEXT,
  DIVIDER,
  FONT_STACK,
  GOLD,
  INK,
  INNER_GAP,
  MUTED,
  PAGE,
  PRIMARY,
  PRIMARY_FOREGROUND,
  SURFACE,
} from './email-tokens.js'
import {
  APPROVAL_TRIGGER_LABELS,
  EVENT_LABELS,
  formatTriggerReason,
  MEDIA_AVAILABLE_HEADINGS,
  mediaTypeLabel,
  TEST_NOTIFICATION,
  WATCHLIST_CAP_IMPACT,
  WATCHLIST_CAP_TITLE,
} from './labels.js'
import {
  type MediaAvailability,
  summarizeMediaAvailable,
} from './media-available.js'

export function escapeHtml(str: string): string {
  if (!str) return ''
  const escapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
    '`': '&#x60;',
  }
  return str.replace(/[&<>'"`]/g, (c) => escapeMap[c] || c)
}

const TABLE_ATTRS = 'role="presentation" cellpadding="0" cellspacing="0"'

function htmlWrapper(bandLabel: string, content: string): string {
  return `<div style="margin:0;padding:32px 16px;background:${PAGE};font-family:${FONT_STACK};color:${INK};">
  <table ${TABLE_ATTRS} width="600" align="center" style="width:100%;max-width:600px;margin:0 auto;border-collapse:separate;border:2px solid ${INK};border-radius:8px;background:${CARD};box-shadow:4px 4px 0 0 ${INK};">
    <tr><td style="padding:10px 24px;background:${PRIMARY};border-bottom:2px solid ${INK};border-radius:6px 6px 0 0;">
      <table ${TABLE_ATTRS} width="100%" style="width:100%;"><tr>
        <td width="50%" style="width:50%;white-space:nowrap;font-size:15px;font-weight:700;color:${PRIMARY_FOREGROUND};letter-spacing:-0.01em;">Pulsarr</td>
        <td align="right" width="50%" style="width:50%;padding-left:16px;text-align:right;font-size:13px;font-weight:500;color:${PRIMARY_FOREGROUND};">${escapeHtml(bandLabel)}</td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:24px;font-size:14px;line-height:1.5;color:${INK};">${content}</td></tr>
  </table>
</div>`
}

/** Spaces each non-empty block after the first by `gap`. */
function stack(gap: string, blocks: string[]): string {
  return blocks
    .filter(Boolean)
    .map((block, index) =>
      index === 0 ? block : `<div style="margin-top:${gap};">${block}</div>`,
    )
    .join('')
}

function posterHero(
  posterUrl: string | undefined,
  contentTitle: string,
  content: string,
): string {
  const posterCell = posterUrl
    ? `<td width="120" valign="top" style="width:120px;vertical-align:top;padding-right:20px;"><img src="${escapeHtml(posterUrl)}" alt="${escapeHtml(contentTitle)} poster" width="120" height="180" style="display:block;width:120px;height:180px;border:2px solid ${INK};border-radius:6px;background:${SURFACE};font-size:12px;color:${MUTED};"></td>`
    : ''
  return `<table ${TABLE_ATTRS} width="100%" style="width:100%;"><tr>${posterCell}<td valign="top" style="vertical-align:top;">${content}</td></tr></table>`
}

type PillTone = 'warn' | 'neutral' | 'stop'

const PILL_TONES: Record<
  PillTone,
  { border: string; background: string; color: string }
> = {
  warn: { border: INK, background: GOLD, color: INK },
  neutral: { border: INK, background: SURFACE, color: INK },
  stop: { border: DESTRUCTIVE, background: CARD, color: DESTRUCTIVE_TEXT },
}

function pill(text: string, tone: PillTone): string {
  const { border, background, color } = PILL_TONES[tone]
  return `<span style="display:inline-block;height:24px;line-height:20px;padding:0 8px;border:2px solid ${border};border-radius:6px;background:${background};color:${color};font-size:12px;font-weight:700;">${escapeHtml(text)}</span>`
}

function title(text: string, badge?: { text: string; tone: PillTone }): string {
  const badgeHtml = badge
    ? `<div style="margin-bottom:8px;">${pill(badge.text, badge.tone)}</div>`
    : ''
  return `${badgeHtml}<h1 style="margin:0;font-size:22px;line-height:1.25;font-weight:700;color:${INK};">${escapeHtml(text)}</h1>`
}

interface FactRow {
  label: string
  value: string
  sub?: string | null
}

function factRows(rows: FactRow[], labelWidth = '128px'): string {
  const rowsHtml = rows
    .map((row, index) => {
      const borderTop = index === 0 ? '' : `border-top:1px solid ${DIVIDER};`
      const sub = row.sub
        ? `<div style="font-weight:400;color:${MUTED};">${escapeHtml(row.sub)}</div>`
        : ''
      return `<tr>
        <td valign="top" style="width:${labelWidth};vertical-align:top;padding:8px 16px 8px 0;${borderTop}font-size:14px;color:${MUTED};white-space:nowrap;">${escapeHtml(row.label)}</td>
        <td valign="top" style="vertical-align:top;padding:8px 0;${borderTop}font-size:14px;font-weight:500;color:${INK};">${escapeHtml(row.value)}${sub}</td>
      </tr>`
    })
    .join('')
  return `<table ${TABLE_ATTRS} width="100%" style="width:100%;border-collapse:collapse;">${rowsHtml}</table>`
}

function sectionHeading(text: string, meta?: string): string {
  const metaHtml = meta
    ? `<span style="font-weight:400;color:${MUTED};">, ${escapeHtml(meta)}</span>`
    : ''
  return `<h2 style="margin:0;font-size:16px;font-weight:700;color:${INK};">${escapeHtml(text)}${metaHtml}</h2>`
}

function paragraph(text: string, muted = false): string {
  return `<p style="margin:0;font-size:14px;color:${muted ? MUTED : INK};">${escapeHtml(text)}</p>`
}

function notice(text: string): string {
  return `<p style="margin:0;font-size:14px;font-weight:700;color:${INK};">${escapeHtml(text)}</p>`
}

function link(url: string, text: string): string {
  return `<div style="padding-top:4px;text-align:left;"><a href="${escapeHtml(url)}" style="font-size:14px;font-weight:700;color:${INK};text-decoration:underline;text-underline-offset:3px;">${escapeHtml(text)}</a></div>`
}

function divider(): string {
  return `<div style="height:1px;line-height:1px;font-size:0;background:${DIVIDER};">&nbsp;</div>`
}

interface Stat {
  value: number
  label: string
}

function statRow(stats: Stat[]): string {
  const cells = stats
    .map((stat, index) => {
      const padding =
        index === 0
          ? 'padding:0 12px 0 0;'
          : `padding:0 12px;border-left:1px solid ${DIVIDER};`
      return `<td valign="top" width="25%" style="width:25%;vertical-align:top;${padding}">
        <div style="font-size:24px;line-height:1.2;font-weight:700;color:${INK};">${stat.value}</div>
        <div style="font-size:13px;color:${MUTED};">${escapeHtml(stat.label)}</div>
      </td>`
    })
    .join('')
  return `<table ${TABLE_ATTRS} width="100%" style="width:100%;border-collapse:collapse;"><tr>${cells}</tr></table>`
}

function moreLine(text: string): string {
  return `<p style="margin:4px 0 0;font-size:14px;color:${MUTED};">${escapeHtml(text)}</p>`
}

function titleList(section: DeleteSyncSection): string {
  const heading = sectionHeading(section.label, section.meta)
  if (section.deleted <= 0) {
    return `${heading}${moreLine(sectionEmptyText(section))}`
  }
  const items = section.shown
    .map((item) => `<li style="margin:0 0 4px;">${escapeHtml(item)}</li>`)
    .join('')
  const list = items
    ? `<ul style="margin:8px 0 0;padding:0 0 0 20px;font-size:14px;color:${INK};">${items}</ul>`
    : ''
  const more = section.remaining > 0 ? moreLine(sectionMoreText(section)) : ''
  return `${heading}${list}${more}`
}

function alert(head: string, text: string): string {
  return `<table ${TABLE_ATTRS} width="100%" style="width:100%;border-collapse:separate;border:2px solid ${DESTRUCTIVE};border-radius:6px;"><tr><td style="padding:12px 16px;">
    <div style="font-size:14px;font-weight:700;color:${DESTRUCTIVE_TEXT};">${escapeHtml(head)}</div>
    <div style="margin-top:2px;font-size:14px;color:${INK};">${escapeHtml(text)}</div>
  </td></tr></table>`
}

function releaseNotes(releaseBodyHtml: string): string {
  // GitHub's /markdown API output is sanitized server-side, so it is injected unescaped
  return `${sectionHeading('Release notes')}<div style="margin-top:8px;font-size:14px;color:${INK};line-height:1.5;">${releaseBodyHtml}</div>`
}

const MEDIA_AVAILABLE_NOTICES: Partial<Record<MediaAvailability, string>> = {
  content: 'New content is now available to watch!',
  movie: 'Movie available to watch!',
}

export function createMediaAppriseMessage(
  notification: MediaNotification,
): AppriseMessage {
  const { availability, details } = summarizeMediaAvailable(notification)
  const mediaNotice = MEDIA_AVAILABLE_NOTICES[availability]
  const heading = MEDIA_AVAILABLE_HEADINGS[availability]

  const bodyHtml = htmlWrapper(
    heading,
    posterHero(
      notification.posterUrl,
      notification.title,
      stack(INNER_GAP, [
        title(notification.title),
        details.length > 0 ? factRows(details) : '',
        mediaNotice ? notice(mediaNotice) : '',
        notification.tmdbUrl ? link(notification.tmdbUrl, 'View on TMDB') : '',
      ]),
    ),
  )

  const textLines = [
    ...details.map((detail) => `${detail.label}: ${detail.value}`),
    ...(mediaNotice ? [mediaNotice] : []),
  ].join('\n')

  let body = `${heading}\n\n${notification.title}\n${textLines}`
  if (notification.tmdbUrl) {
    body += `\nTMDB: ${notification.tmdbUrl}`
  }

  return {
    title: `${MEDIA_AVAILABLE_HEADINGS[availability]}: ${notification.title}`,
    body,
    bodyHtml,
    type: 'info',
    attachment: notification.posterUrl,
  }
}

const APPROVAL_ACTION_REQUIRED =
  'Visit the Pulsarr UI to review and handle this approval request.'

export function createApprovalAppriseMessage(
  notification: ApprovalNotification,
): AppriseMessage {
  const contentType = mediaTypeLabel(notification.contentType).label

  const bodyHtml = htmlWrapper(
    EVENT_LABELS.approvalRequest,
    stack(BLOCK_GAP, [
      posterHero(
        notification.posterUrl,
        notification.contentTitle,
        stack(INNER_GAP, [
          title(notification.contentTitle, {
            text: 'Pending approval',
            tone: 'warn',
          }),
          factRows(
            [
              { label: 'Type', value: contentType },
              { label: 'Requested by', value: notification.requestedBy },
              {
                label: 'Pending requests',
                value: `${notification.totalPending} awaiting review`,
              },
              {
                label: 'Reason',
                value: APPROVAL_TRIGGER_LABELS[notification.trigger],
                sub: notification.reason,
              },
            ],
            '136px',
          ),
        ]),
      ),
      divider(),
      stack(INNER_GAP, [
        notice(APPROVAL_ACTION_REQUIRED),
        notification.tmdbUrl ? link(notification.tmdbUrl, 'View on TMDB') : '',
      ]),
    ]),
  )

  let textBody = `${EVENT_LABELS.approvalRequest}\n\n`
  textBody += `${notification.contentTitle}\n`
  textBody += `Type: ${contentType}\n\n`
  textBody += `Requested by: ${notification.requestedBy}\n`
  textBody += `Total pending: ${notification.totalPending} requests\n`
  textBody += `Reason: ${formatTriggerReason(notification.trigger, notification.reason)}\n`
  if (notification.tmdbUrl) textBody += `TMDB: ${notification.tmdbUrl}\n`
  textBody += `\n${APPROVAL_ACTION_REQUIRED}\n`

  return {
    title: `${EVENT_LABELS.approvalRequest}: ${notification.contentTitle}`,
    body: textBody,
    bodyHtml,
    type: 'info',
    attachment: notification.posterUrl,
  }
}

export function createUpdateAvailableAppriseMessage(
  release: UpdateAvailableRelease,
): AppriseMessage {
  const subject = `${EVENT_LABELS.updateAvailable}: Pulsarr ${release.latestVersion}`
  const displayName = release.releaseName?.trim() || `v${release.latestVersion}`
  const publishedAt = release.publishedAt
    ? new Date(release.publishedAt).toLocaleDateString()
    : null

  const bodyHtml = htmlWrapper(
    EVENT_LABELS.updateAvailable,
    stack(BLOCK_GAP, [
      stack(INNER_GAP, [
        title(displayName),
        factRows([
          { label: 'Current', value: `v${release.currentVersion}` },
          { label: 'Latest', value: `v${release.latestVersion}` },
          ...(publishedAt ? [{ label: 'Published', value: publishedAt }] : []),
        ]),
        link(release.releaseUrl, 'View release on GitHub'),
      ]),
      release.releaseBodyHtml ? divider() : '',
      release.releaseBodyHtml ? releaseNotes(release.releaseBodyHtml) : '',
    ]),
  )

  // Telegram caps a message at 4096 chars, so the text fallback truncates the notes
  const MAX_TEXT_NOTES = 1500
  const notes = release.releaseBody?.trim()
  const truncatedNotes =
    notes && notes.length > MAX_TEXT_NOTES
      ? `${notes.slice(0, MAX_TEXT_NOTES)}...`
      : notes

  let textBody = 'Pulsarr update available\n\n'
  textBody += `${displayName}\n`
  textBody += `Current: v${release.currentVersion}\n`
  textBody += `Latest: v${release.latestVersion}\n`
  if (publishedAt) textBody += `Published: ${publishedAt}\n`
  if (truncatedNotes) textBody += `\nRelease Notes:\n${truncatedNotes}\n`
  textBody += `\nView release: ${release.releaseUrl}\n`

  return { title: subject, body: textBody, bodyHtml, type: 'info' }
}

export function createWatchlistCapAppriseMessage(
  event: WatchlistCapNotification,
  userName: string,
): AppriseMessage {
  const contentLabel = mediaTypeLabel(event.contentType).label
  const usage = `${event.currentCount} / ${event.cap}`

  const bodyHtml = htmlWrapper(
    EVENT_LABELS.watchlistCap,
    stack(INNER_GAP, [
      title(WATCHLIST_CAP_TITLE),
      factRows([
        { label: 'User', value: userName },
        { label: 'Content type', value: contentLabel },
        { label: 'Usage', value: usage },
      ]),
      notice(WATCHLIST_CAP_IMPACT),
    ]),
  )

  let textBody = `${WATCHLIST_CAP_TITLE}\n\n`
  textBody += `User: ${userName}\n`
  textBody += `Content Type: ${contentLabel}\n`
  textBody += `Usage: ${usage}\n\n`
  textBody += `${WATCHLIST_CAP_IMPACT}\n`

  return {
    title: `${WATCHLIST_CAP_TITLE}: ${userName}`,
    body: textBody,
    bodyHtml,
    type: 'warning',
  }
}

function deletedSectionText(section: DeleteSyncSection): string {
  if (section.deleted <= 0) {
    return `${section.label}: ${sectionEmptyText(section)}\n\n`
  }
  const textList = section.shown.map((item) => `• ${item}`).join('\n')
  const text = `${section.label} (${section.meta}):\n${textList || 'None'}\n`
  return section.remaining > 0
    ? `${text}${sectionMoreText(section)}\n\n`
    : `${text}\n`
}

function deleteSyncMessageType(
  results: DeleteSyncResult,
  dryRun: boolean,
): AppriseMessageType {
  if (results.safetyTriggered) return 'failure'
  return dryRun ? 'info' : 'success'
}

function deleteSyncPill(
  results: DeleteSyncResult,
  dryRun: boolean,
): { text: string; tone: PillTone } | undefined {
  if (results.safetyTriggered) return { text: 'Stopped', tone: 'stop' }
  return dryRun ? { text: 'Dry run', tone: 'neutral' } : undefined
}

export function createDeleteSyncAppriseMessage(
  results: DeleteSyncResult,
  dryRun: boolean,
): AppriseMessage {
  const summary = summarizeDeleteSync(results, dryRun)
  const { totals } = summary
  const deletedLabel = summary.dryRun ? 'Would delete' : 'Deleted'
  const timestamp = new Date().toLocaleString()

  const stats: Stat[] = [
    { value: totals.processed, label: 'Processed' },
    { value: totals.deleted, label: deletedLabel },
    { value: totals.skipped, label: 'Skipped' },
    ...(totals.protected
      ? [{ value: totals.protected, label: 'Protected' }]
      : []),
  ]

  const bodyHtml = htmlWrapper(
    EVENT_LABELS.deleteSync,
    stack(BLOCK_GAP, [
      stack(INNER_GAP, [
        title(summary.title, deleteSyncPill(results, dryRun)),
        summary.summaryText ? paragraph(summary.summaryText) : '',
        summary.protectedText ? paragraph(summary.protectedText, true) : '',
      ]),
      summary.safetyMessage
        ? alert('Safety reason', summary.safetyMessage)
        : '',
      statRow(stats),
      divider(),
      titleList(summary.movies),
      titleList(summary.shows),
      divider(),
      paragraph(`Completed at ${timestamp}`, true),
    ]),
  )

  const intro = [summary.summaryText, summary.protectedText]
    .filter(Boolean)
    .join(' ')
  let textBody = intro ? `${intro}\n\n` : ''
  textBody += 'Summary:\n'
  textBody += `Processed: ${totals.processed} items\n`
  textBody += `${deletedLabel}: ${totals.deleted} items\n`
  textBody += `Skipped: ${totals.skipped} items\n`
  if (totals.protected) {
    textBody += `Protected: ${totals.protected} items\n`
  }
  textBody += '\n'
  if (summary.safetyMessage) {
    textBody += `Safety Reason: ${summary.safetyMessage}\n\n`
  }
  textBody += deletedSectionText(summary.movies)
  textBody += deletedSectionText(summary.shows)
  textBody += `Delete sync completed at ${timestamp}`

  return {
    title: summary.title,
    body: textBody,
    bodyHtml,
    type: deleteSyncMessageType(results, dryRun),
  }
}

export function createWatchlistAddedAppriseMessage(
  item: MediaNotification,
  addedBy: string,
): AppriseMessage {
  const { label: mediaType } = mediaTypeLabel(item.type)

  const bodyHtml = htmlWrapper(
    EVENT_LABELS.watchlistAdded,
    posterHero(
      item.posterUrl,
      item.title,
      stack(INNER_GAP, [
        title(item.title),
        factRows([
          { label: 'Type', value: mediaType },
          { label: 'Added by', value: addedBy },
        ]),
        item.tmdbUrl ? link(item.tmdbUrl, 'View on TMDB') : '',
      ]),
    ),
  )

  let textBody = `New ${mediaType} Added\n\n`
  textBody += `${item.title}\n`
  textBody += `Type: ${mediaType}\n`
  textBody += `Added by: ${addedBy}`
  if (item.tmdbUrl) {
    textBody += `\nTMDB: ${item.tmdbUrl}`
  }

  return {
    title: `${EVENT_LABELS.watchlistAdded}: ${item.title}`,
    body: textBody,
    bodyHtml,
    type: 'info',
    attachment: item.posterUrl,
  }
}

export function createTestAppriseMessage(): AppriseMessage {
  const { title: testTitle, body } = TEST_NOTIFICATION

  return {
    title: testTitle,
    body: `${testTitle}\n\n${body}`,
    bodyHtml: htmlWrapper(
      EVENT_LABELS.test,
      stack(INNER_GAP, [title(testTitle), paragraph(body)]),
    ),
    type: 'info',
  }
}
