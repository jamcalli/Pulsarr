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
  summarizeDeleteSync,
} from './delete-sync-summary.js'
import {
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

const BORDER = '2px solid #000000'
const SHADOW = '4px 4px 0px 0px #000000'

const WRAPPER_STYLE = `font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: ${BORDER}; border-radius: 5px; background-color: #48a9a6; color: #000000; box-shadow: ${SHADOW};`
const CARD_STYLE = `margin-bottom: 20px; padding: 15px; border-radius: 5px; border: ${BORDER}; box-shadow: ${SHADOW};`
const CARD_BACKGROUND = '#212121'
const SAFETY_CARD_BACKGROUND = '#c1666b'
const PAGE_HEADING_STYLE = 'color: #000000; margin-top: 0; font-weight: 700;'
const HEADING_STYLE = 'margin-top: 0; color: #ffffff; font-weight: 700;'
const SECTION_HEADING_STYLE = `${HEADING_STYLE} border-bottom: 1px solid #343746; padding-bottom: 5px;`
const LABEL_STYLE = 'color: #ffffff; font-weight: 700; font-size: 14px;'
const VALUE_STYLE = 'color: #ffffff; font-weight: 500;'
const NOTICE_STYLE = 'color: #ffffff; font-weight: 700; text-align: center;'
const LINK_STYLE = 'color: #48a9a6; font-weight: 500; text-decoration: none;'
const DIVIDER_STYLE =
  'margin-top: 15px; padding-top: 15px; border-top: 1px solid #343746;'
const POSTER_STYLE = `border-radius: 5px; border: ${BORDER}; box-shadow: ${SHADOW};`
const CENTER_BLOCK_STYLE = 'text-align: center; margin-bottom: 20px;'

function htmlWrapper(content: string): string {
  return `
    <div style="${WRAPPER_STYLE}">
      ${content}
    </div>
    `
}

function card(inner: string, background = CARD_BACKGROUND): string {
  return `
    <div style="${CARD_STYLE} background-color: ${background};">
      ${inner}
    </div>
  `
}

function pageHeading(text: string): string {
  return `<h2 style="${PAGE_HEADING_STYLE}">${text}</h2>`
}

function heading(text: string): string {
  return `<h3 style="${HEADING_STYLE}">${text}</h3>`
}

function sectionHeading(text: string): string {
  return `<h4 style="${SECTION_HEADING_STYLE}">${text}</h4>`
}

function paragraph(inner: string): string {
  return `<p style="${VALUE_STYLE}">${inner}</p>`
}

function labelledParagraph(label: string, value: string): string {
  return paragraph(
    `<strong style="color: #ffffff;">${label}:</strong> ${value}`,
  )
}

function labelValue(label: string, value: string): string {
  return `
      <div style="margin-bottom: 10px;">
        <div style="${LABEL_STYLE}">${label}</div>
        <div style="${VALUE_STYLE}">${value}</div>
      </div>`
}

function divider(): string {
  return `<div style="${DIVIDER_STYLE}"></div>`
}

function link(url: string, text: string): string {
  return `<a href="${escapeHtml(url)}" style="${LINK_STYLE}">${text}</a>`
}

function centeredLink(url: string, text: string): string {
  return `<div style="${CENTER_BLOCK_STYLE}">${link(url, text)}</div>`
}

function tmdbLink(url: string | undefined): string {
  return url
    ? `<p style="margin-top: 10px;">${link(url, 'View on TMDB')}</p>`
    : ''
}

function createPosterHtml(
  posterUrl: string | undefined,
  title: string,
  maxWidth = 200,
): string {
  if (!posterUrl) return ''
  return `<div style="${CENTER_BLOCK_STYLE}">
       <img src="${escapeHtml(posterUrl)}" alt="${escapeHtml(title)} poster" style="max-width: ${maxWidth}px; ${POSTER_STYLE}">
     </div>`
}

const MEDIA_AVAILABLE_HEADINGS: Record<MediaAvailability, string> = {
  episode: 'New Episode Available',
  season: 'New Season Available',
  content: 'New Content Available',
  movie: 'Movie Available',
}

const MEDIA_AVAILABLE_NOTICES: Partial<Record<MediaAvailability, string>> = {
  content: 'New content is now available to watch!',
  movie: 'Movie available to watch!',
}

export function createMediaAppriseMessage(
  notification: MediaNotification,
): AppriseMessage {
  const { emoji } = mediaTypeLabel(notification.type)
  const { availability, details } = summarizeMediaAvailable(notification)
  const notice = MEDIA_AVAILABLE_NOTICES[availability]

  const htmlLines =
    details
      .map((detail) =>
        labelledParagraph(detail.label, escapeHtml(detail.value)),
      )
      .join('') + (notice ? paragraph(escapeHtml(notice)) : '')

  const bodyHtml = htmlWrapper(
    createPosterHtml(notification.posterUrl, notification.title) +
      card(
        heading(escapeHtml(notification.title)) +
          htmlLines +
          tmdbLink(notification.tmdbUrl),
      ),
  )

  const textLines = [
    ...details.map((detail) => `${detail.label}: ${detail.value}`),
    ...(notice ? [notice] : []),
  ].join('\n')

  let body = `${MEDIA_AVAILABLE_HEADINGS[availability]}\n\n${notification.title}\n${textLines}`
  if (notification.tmdbUrl) {
    body += `\nTMDB: ${notification.tmdbUrl}`
  }

  return {
    title: `${emoji} ${notification.title}`,
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
  const contentCard = card(
    createPosterHtml(notification.posterUrl, notification.contentTitle, 150) +
      heading(escapeHtml(notification.contentTitle)) +
      labelValue('TYPE', escapeHtml(contentType)),
  )

  const requestCard = card(
    sectionHeading('Request Details') +
      labelValue('REQUESTED BY', escapeHtml(notification.requestedBy)) +
      labelValue(
        'PENDING REQUESTS',
        `${notification.totalPending} awaiting review`,
      ) +
      divider() +
      labelValue('REASON FOR APPROVAL', escapeHtml(notification.reason)),
  )

  const actionCard = card(
    `<div style="${NOTICE_STYLE}">${escapeHtml(APPROVAL_ACTION_REQUIRED)}</div>`,
  )

  const bodyHtml = htmlWrapper(
    pageHeading('Content Approval Required') +
      contentCard +
      (notification.tmdbUrl
        ? centeredLink(notification.tmdbUrl, 'View on TMDB')
        : '') +
      requestCard +
      actionCard,
  )

  let textBody = 'Content Approval Required\n\n'
  textBody += `${notification.contentTitle}\n`
  textBody += `Type: ${contentType}\n\n`
  textBody += `Requested by: ${notification.requestedBy}\n`
  textBody += `Total pending: ${notification.totalPending} requests\n`
  textBody += `Reason: ${notification.reason}\n`
  if (notification.tmdbUrl) textBody += `TMDB: ${notification.tmdbUrl}\n`
  textBody += `\n${APPROVAL_ACTION_REQUIRED}\n`

  return {
    title: `New Approval Request: ${notification.contentTitle}`,
    body: textBody,
    bodyHtml,
    type: 'info',
    attachment: notification.posterUrl,
  }
}

export function createUpdateAvailableAppriseMessage(
  release: UpdateAvailableRelease,
): AppriseMessage {
  const title = `🚀 Pulsarr ${release.latestVersion} is available`
  const displayName = release.releaseName?.trim() || `v${release.latestVersion}`
  const publishedAt = release.publishedAt
    ? new Date(release.publishedAt).toLocaleDateString()
    : null

  const versionsCard = card(
    heading(escapeHtml(displayName)) +
      labelValue('CURRENT', `v${escapeHtml(release.currentVersion)}`) +
      labelValue('LATEST', `v${escapeHtml(release.latestVersion)}`) +
      (publishedAt
        ? divider() + labelValue('PUBLISHED', escapeHtml(publishedAt))
        : ''),
  )

  // GitHub's /markdown API output is sanitized server-side, so it is injected unescaped
  const notesCard = release.releaseBodyHtml
    ? card(
        sectionHeading('Release Notes') +
          `<div style="margin-top: 15px; ${VALUE_STYLE}">${release.releaseBodyHtml}</div>`,
      )
    : ''

  const bodyHtml = htmlWrapper(
    pageHeading('Pulsarr update available') +
      versionsCard +
      centeredLink(release.releaseUrl, 'View release on GitHub') +
      notesCard,
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

  return { title, body: textBody, bodyHtml, type: 'info' }
}

export function createWatchlistCapAppriseMessage(
  event: WatchlistCapNotification,
  userName: string,
): AppriseMessage {
  const contentLabel = mediaTypeLabel(event.contentType).label

  const detailsCard = card(
    sectionHeading('Cap Details') +
      labelValue('USER', escapeHtml(userName)) +
      labelValue('CONTENT TYPE', escapeHtml(contentLabel)) +
      divider() +
      labelValue('USAGE', `${event.currentCount} / ${event.cap}`),
  )

  const bodyHtml = htmlWrapper(
    pageHeading(WATCHLIST_CAP_TITLE) +
      detailsCard +
      card(`<div style="${NOTICE_STYLE}">${WATCHLIST_CAP_IMPACT}</div>`),
  )

  let textBody = `${WATCHLIST_CAP_TITLE}\n\n`
  textBody += `User: ${userName}\n`
  textBody += `Content Type: ${contentLabel}\n`
  textBody += `Usage: ${event.currentCount} / ${event.cap}\n\n`
  textBody += `${WATCHLIST_CAP_IMPACT}\n`

  return {
    title: WATCHLIST_CAP_TITLE,
    body: textBody,
    bodyHtml,
    type: 'warning',
  }
}

function deletedSection(section: DeleteSyncSection): {
  html: string
  text: string
} {
  const { label, noun, protectedInfo, shown, remaining } = section

  if (section.deleted <= 0) {
    return {
      html: card(
        heading(label) + paragraph(`No ${noun} deleted${protectedInfo}`),
      ),
      text: `${label}: No ${noun} deleted${protectedInfo}\n\n`,
    }
  }

  const listItems = shown
    .map(
      (title) =>
        `<li style="margin-bottom: 5px; ${VALUE_STYLE}">${escapeHtml(title)}</li>`,
    )
    .join('')

  const html = card(
    heading(`${label} (${section.deleted} deleted${protectedInfo})`) +
      `<ul style="margin-bottom: 0; padding-left: 20px; color: #ffffff;">
        ${listItems || `<li style="${VALUE_STYLE}">None</li>`}
      </ul>` +
      (remaining > 0
        ? `<p style="font-style: italic; margin-top: 10px; color: #ffffff;">... and ${remaining} more ${noun}</p>`
        : ''),
  )

  const textList = shown.map((title) => `• ${title}`).join('\n')
  let text = `${label} (${section.deleted} deleted${protectedInfo}):\n${textList || 'None'}\n`
  text += remaining > 0 ? `... and ${remaining} more ${noun}\n\n` : '\n'

  return { html, text }
}

function summaryStat(count: number, label: string): string {
  return `<span style="display: inline-block; margin-right: 20px; margin-bottom: 10px;">
        <span style="font-size: 24px; font-weight: 700; color: #ffffff; margin-right: 10px;">${count}</span>
        <span style="${VALUE_STYLE}">${label}</span>
      </span>`
}

function deleteSyncMessageType(
  results: DeleteSyncResult,
  dryRun: boolean,
): AppriseMessageType {
  if (results.safetyTriggered) return 'failure'
  return dryRun ? 'info' : 'success'
}

export function createDeleteSyncAppriseMessage(
  results: DeleteSyncResult,
  dryRun: boolean,
): AppriseMessage {
  const summary = summarizeDeleteSync(results, dryRun)
  const { title, totals } = summary

  let summaryText = summary.summaryText
  if (summary.protectedText) {
    summaryText += ` ${summary.protectedText}`
  }

  const summaryCard = card(
    heading('Summary') +
      `<div style="margin-top: 15px;">
      ${summaryStat(totals.processed, 'Processed')}
      ${summaryStat(totals.deleted, 'Deleted')}
      ${summaryStat(totals.skipped, 'Skipped')}
      ${totals.protected ? summaryStat(totals.protected, 'Protected') : ''}
    </div>`,
    results.safetyTriggered ? SAFETY_CARD_BACKGROUND : CARD_BACKGROUND,
  )

  const safetyCard = summary.safetyMessage
    ? card(
        heading('Safety Reason') + paragraph(escapeHtml(summary.safetyMessage)),
      )
    : ''

  const movies = deletedSection(summary.movies)
  const shows = deletedSection(summary.shows)
  const timestamp = new Date().toLocaleString()

  const bodyHtml = htmlWrapper(
    `<p style="margin-bottom: 20px; color: #000000;">${escapeHtml(summaryText)}</p>` +
      summaryCard +
      safetyCard +
      movies.html +
      shows.html +
      card(
        `<div style="text-align: center; font-style: italic; ${VALUE_STYLE}">Delete sync operation completed at ${escapeHtml(timestamp)}</div>`,
      ),
  )

  let textBody = `${summaryText}\n\n`
  textBody += 'Summary:\n'
  textBody += `Processed: ${totals.processed} items\n`
  textBody += `Deleted: ${totals.deleted} items\n`
  textBody += `Skipped: ${totals.skipped} items\n`
  if (totals.protected) {
    textBody += `Protected: ${totals.protected} items\n`
  }
  textBody += '\n'
  if (summary.safetyMessage) {
    textBody += `Safety Reason: ${summary.safetyMessage}\n\n`
  }
  textBody += movies.text
  textBody += shows.text
  textBody += `Delete sync completed at ${timestamp}`

  return {
    title,
    body: textBody,
    bodyHtml,
    type: deleteSyncMessageType(results, dryRun),
  }
}

export function createWatchlistAddedAppriseMessage(
  item: MediaNotification,
  addedBy: string,
): AppriseMessage {
  const { label: mediaType, emoji } = mediaTypeLabel(item.type)

  const bodyHtml = htmlWrapper(
    card(
      createPosterHtml(item.posterUrl, item.title) +
        heading(escapeHtml(item.title)) +
        labelledParagraph('Type', escapeHtml(mediaType)) +
        labelledParagraph('Added by', escapeHtml(addedBy)) +
        tmdbLink(item.tmdbUrl),
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
    title: `${emoji} ${mediaType} Added: ${item.title}`,
    body: textBody,
    bodyHtml,
    type: 'info',
    attachment: item.posterUrl,
  }
}

export function createTestAppriseMessage(): AppriseMessage {
  const { title, body } = TEST_NOTIFICATION

  return {
    title,
    body: `${title}\n\n${body}`,
    bodyHtml: htmlWrapper(pageHeading(title) + card(paragraph(body))),
    type: 'info',
  }
}
